import WebSocket, { WebSocketServer } from 'ws';
import { TypedEmitter } from '../emitter.js';
import type { ClientLogger, HeaderPolicy, ReverseServerOptions } from '../types.js';
import type { ConnectionEvents } from './types.js';
import { matchAuthorization, normalizeHeaderValue, validateNormalizedHeaders } from '../headers.js';
import { startHeartbeat } from './heartbeat.js';
import { normalizeError } from '../utils.js';

export interface ReverseConnectionOptions {
  server: ReverseServerOptions;
  headerPolicy: HeaderPolicy;
  rejectDuplicateOrigin: boolean;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxPayloadBytes: number;
  WebSocketImpl?: typeof WebSocket;
  logger?: ClientLogger;
}

export class ReverseConnection extends TypedEmitter<ConnectionEvents> {
  private readonly serverOptions: ReverseServerOptions;
  private readonly headerPolicy: HeaderPolicy;
  private readonly rejectDuplicateOrigin: boolean;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxPayloadBytes: number;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly logger?: ClientLogger;

  private server?: WebSocketServer;
  private connectPromise?: Promise<void>;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly heartbeatStops = new Map<string, () => void>();
  private readonly connectionCounts = new Map<string, number>();
  private readonly originBySelfName = new Map<string, string>();
  private readonly selfNameByOrigin = new Map<string, string>();

  constructor(options: ReverseConnectionOptions) {
    super();
    this.serverOptions = options.server;
    this.headerPolicy = options.headerPolicy;
    this.rejectDuplicateOrigin = options.rejectDuplicateOrigin;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs;
    this.maxPayloadBytes = options.maxPayloadBytes;
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.logger = options.logger;
  }

  list(): string[] {
    return [...this.sockets.keys()];
  }

  isOpen(selfName?: string): boolean {
    if (selfName) {
      return this.sockets.get(selfName)?.readyState === this.WebSocketImpl.OPEN;
    }
    for (const socket of this.sockets.values()) {
      if (socket.readyState === this.WebSocketImpl.OPEN) {
        return true;
      }
    }
    return false;
  }

  async connect(): Promise<void> {
    if (this.server) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({
        port: this.serverOptions.port,
        host: this.serverOptions.host,
        path: this.serverOptions.path,
        maxPayload: this.maxPayloadBytes > 0 ? this.maxPayloadBytes : undefined,
      });
      this.server = server;

      let listening = false;
      const handleListening = () => {
        listening = true;
        resolve();
      };
      const handleError = (error: Error) => {
        const normalized = normalizeError(error);
        if (!listening) {
          this.server = undefined;
          reject(normalized);
          return;
        }
        this.logger?.error?.('Reverse server error', { error: normalized });
      };

      server.once('listening', handleListening);
      server.on('error', handleError);
      server.on('connection', (socket, request) => this.handleConnection(socket, request));
    }).finally(() => {
      this.connectPromise = undefined;
    });

    return this.connectPromise;
  }

  async waitForOpen(timeoutMs: number, selfName?: string): Promise<void> {
    await this.connect();
    if (selfName ? this.isOpen(selfName) : this.isOpen()) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Reverse connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const handleOpen = (name: string) => {
        if (selfName && name !== selfName) {
          return;
        }
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off('open', handleOpen);
      };

      this.on('open', handleOpen);
    });
  }

  async close(code = 1000, reason = 'client closing', selfName?: string): Promise<void> {
    if (selfName) {
      await this.closeSocket(selfName, code, reason);
      return;
    }

    const names = [...this.sockets.keys()];
    await Promise.all(names.map((name) => this.closeSocket(name, code, reason)));

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = undefined;
  }

  async send(payload: string, selfName: string): Promise<void> {
    const socket = this.sockets.get(selfName);
    if (!socket || socket.readyState !== this.WebSocketImpl.OPEN) {
      throw new Error(`WebSocket is not open for ${selfName}. Wait for a reverse connection.`);
    }

    await new Promise<void>((resolve, reject) => {
      socket.send(payload, (error?: Error | null) => {
        if (!error) {
          resolve();
          return;
        }
        reject(normalizeError(error));
      });
    });
  }

  async remove(selfName: string, code = 1000, reason = 'client closing'): Promise<void> {
    await this.closeSocket(selfName, code, reason);
  }

  private async closeSocket(selfName: string, code: number, reason: string): Promise<void> {
    const socket = this.sockets.get(selfName);
    if (!socket) {
      return;
    }

    this.stopHeartbeat(selfName);

    if (socket.readyState === this.WebSocketImpl.CLOSED) {
      if (this.sockets.get(selfName) === socket) {
        this.emit('close', selfName, code, reason);
        this.cleanupConnection(selfName, socket);
      }
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close(code, reason);
    });
  }

  private handleConnection(socket: WebSocket, request: import('http').IncomingMessage): void {
    const normalized = normalizeHeaderValue(request.headers);
    const reject = (reason: string, meta?: Record<string, unknown>) => {
      socket.close(1008, reason);
      this.logger?.warn?.('Reverse connection rejected', {
        reason,
        headers: normalized,
        ...meta,
      });
    };
    const { ok, reason } = validateNormalizedHeaders(normalized, this.headerPolicy);
    if (!ok) {
      reject(reason ?? 'invalid headers');
      return;
    }
    if (!this.headerPolicy.strict && this.headerPolicy.expectedAccessToken) {
      const incomingAuth = normalized['authorization'];
      if (!matchAuthorization(this.headerPolicy.expectedAccessToken, incomingAuth)) {
        reject('authorization mismatch');
        return;
      }
    }

    const incomingOrigin = normalized['x-client-origin'];
    if (this.rejectDuplicateOrigin && incomingOrigin && this.selfNameByOrigin.has(incomingOrigin)) {
      reject('duplicate client origin', { clientOrigin: incomingOrigin });
      return;
    }

    const selfName = normalized['x-self-name'];
    if (!selfName) {
      reject('missing x-self-name header');
      return;
    }
    const existing = this.sockets.get(selfName);
    this.stopHeartbeat(selfName);
    const previousOrigin = this.originBySelfName.get(selfName);
    if (previousOrigin && this.selfNameByOrigin.get(previousOrigin) === selfName) {
      this.selfNameByOrigin.delete(previousOrigin);
    }
    this.originBySelfName.delete(selfName);

    this.sockets.set(selfName, socket);
    if (incomingOrigin) {
      this.originBySelfName.set(selfName, incomingOrigin);
      this.selfNameByOrigin.set(incomingOrigin, selfName);
    }
    const stopHeartbeat = startHeartbeat(
      socket,
      { intervalMs: this.heartbeatIntervalMs, timeoutMs: this.heartbeatTimeoutMs },
      this.logger,
    );
    this.heartbeatStops.set(selfName, stopHeartbeat);

    const count = (this.connectionCounts.get(selfName) ?? 0) + 1;
    this.connectionCounts.set(selfName, count);
    if (count > 1) {
      this.emit('reconnect', selfName, count - 1, 0);
    }

    this.emit('open', selfName);

    socket.on('message', (data: WebSocket.RawData) => this.emit('message', selfName, data));
    socket.on('close', (code: number, reasonBuffer: Buffer) => {
      const reasonText = reasonBuffer?.toString() ?? '';
      this.emit('close', selfName, code, reasonText);
      if (this.sockets.get(selfName) === socket) {
        this.cleanupConnection(selfName, socket);
      }
    });
    socket.on('error', (error: Error) => this.emit('error', selfName, normalizeError(error)));

    if (existing && existing.readyState === this.WebSocketImpl.OPEN) {
      existing.close(1001, 'replaced by new connection');
    }
  }

  private stopHeartbeat(selfName: string): void {
    const stop = this.heartbeatStops.get(selfName);
    if (!stop) {
      return;
    }
    stop();
    this.heartbeatStops.delete(selfName);
  }

  private cleanupConnection(selfName: string, socket: WebSocket): void {
    if (this.sockets.get(selfName) !== socket) {
      return;
    }
    this.sockets.delete(selfName);
    this.stopHeartbeat(selfName);
    const origin = this.originBySelfName.get(selfName);
    if (origin) {
      this.originBySelfName.delete(selfName);
      if (this.selfNameByOrigin.get(origin) === selfName) {
        this.selfNameByOrigin.delete(origin);
      }
    }
  }

}
