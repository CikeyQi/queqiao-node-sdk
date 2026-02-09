import WebSocket from 'ws';
import { TypedEmitter } from '../emitter.js';
import type { ClientLogger } from '../types.js';
import { startHeartbeat } from './heartbeat.js';
import { normalizeError } from '../utils.js';

type ForwardConnectionEvents = {
  open: [];
  close: [code: number, reason: string];
  message: [data: WebSocket.RawData];
  error: [error: Error];
  reconnect: [attempt: number, delayMs: number];
};

export interface ForwardConnectionOptions {
  url: string;
  headers: Record<string, string>;
  reconnect: boolean;
  reconnectIntervalMs: number;
  reconnectMaxIntervalMs: number;
  connectTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxPayloadBytes: number;
  WebSocketImpl?: typeof WebSocket;
  logger?: ClientLogger;
}

export class ForwardConnection extends TypedEmitter<ForwardConnectionEvents> {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly reconnect: boolean;
  private readonly reconnectIntervalMs: number;
  private readonly reconnectMaxIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxPayloadBytes: number;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly logger?: ClientLogger;

  private ws?: WebSocket;
  private connectPromise?: Promise<void>;
  private closing = false;
  private reconnectAttempt = 0;
  private reconnectDelayMs: number;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatStop?: () => void;

  constructor(options: ForwardConnectionOptions) {
    super();
    this.url = options.url;
    this.headers = options.headers;
    this.reconnect = options.reconnect;
    this.reconnectIntervalMs = options.reconnectIntervalMs;
    this.reconnectDelayMs = this.reconnectIntervalMs;
    this.reconnectMaxIntervalMs = options.reconnectMaxIntervalMs;
    this.connectTimeoutMs = options.connectTimeoutMs;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs;
    this.maxPayloadBytes = options.maxPayloadBytes;
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.logger = options.logger;
  }

  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === this.WebSocketImpl.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isOpen()) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.closing = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new this.WebSocketImpl(this.url, {
        headers: this.headers,
        maxPayload: this.maxPayloadBytes > 0 ? this.maxPayloadBytes : undefined,
      });
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        ws.terminate();
        reject(new Error(`WebSocket connect timeout after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      const cleanup = () => {
        clearTimeout(connectTimeout);
        ws.off('open', handleOpen);
        ws.off('error', handleError);
      };

      const handleOpen = () => {
        cleanup();
        this.reconnectAttempt = 0;
        this.reconnectDelayMs = this.reconnectIntervalMs;
        this.logger?.info?.('WebSocket connected', { url: this.url });
        this.heartbeatStop?.();
        this.heartbeatStop = startHeartbeat(
          ws,
          {
            intervalMs: this.heartbeatIntervalMs,
            timeoutMs: this.heartbeatTimeoutMs,
          },
          this.logger,
        );
        this.emit('open');
        resolve();
      };

      const handleError = (error: Error) => {
        cleanup();
        this.logger?.error?.('WebSocket connect error', { error });
        reject(normalizeError(error));
      };

      ws.on('open', handleOpen);
      ws.on('error', handleError);
      ws.on('message', (data: WebSocket.RawData) => this.emit('message', data));
      ws.on('close', (code: number, reason: Buffer) => this.handleClose(code, reason));
      ws.on('error', (error: Error) => this.emit('error', normalizeError(error)));
    }).finally(() => {
      this.connectPromise = undefined;
    });

    return this.connectPromise;
  }

  async waitForOpen(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.connect(),
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`WebSocket connect timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
    if (!this.isOpen()) {
      throw new Error(`WebSocket is not open after ${timeoutMs}ms`);
    }
  }

  async close(code = 1000, reason = 'client closing'): Promise<void> {
    this.closing = true;
    this.clearReconnectTimer();

    if (!this.ws) {
      return;
    }

    if (this.ws.readyState === this.WebSocketImpl.CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.ws?.once('close', () => resolve());
      this.ws?.close(code, reason);
    });
  }

  async send(payload: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== this.WebSocketImpl.OPEN) {
      throw new Error('WebSocket is not open. Call connect() first.');
    }

    await new Promise<void>((resolve, reject) => {
      this.ws?.send(payload, (error?: Error | null) => {
        if (!error) {
          resolve();
          return;
        }
        reject(normalizeError(error));
      });
    });
  }

  private handleClose(code: number, reason: Buffer): void {
    const reasonText = reason?.toString() ?? '';
    this.logger?.warn?.('WebSocket closed', { code, reason: reasonText });
    this.heartbeatStop?.();
    this.heartbeatStop = undefined;
    if (this.ws) {
      this.ws = undefined;
    }
    this.emit('close', code, reasonText);

    if (!this.closing && this.reconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = Math.min(this.reconnectDelayMs, this.reconnectMaxIntervalMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch((error) => this.emit('error', normalizeError(error)));
    }, delay);

    this.reconnectDelayMs = Math.min(delay * 2, this.reconnectMaxIntervalMs);
    this.emit('reconnect', this.reconnectAttempt, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}
