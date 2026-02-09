import type WebSocket from 'ws';
import { TypedEmitter } from '../emitter.js';
import type { ClientLogger, ForwardConnectionConfig } from '../types.js';
import type { NormalizedForwardConnection } from '../options.js';
import { normalizeForwardConnection } from '../options.js';
import { ForwardConnection } from './forward.js';
import type { ConnectionEvents } from './types.js';

export interface ForwardConnectionPoolOptions {
  connections: NormalizedForwardConnection[];
  headerDefaults: {
    headers?: Record<string, string>;
    selfName?: string;
    accessToken?: string;
  };
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

export class ForwardConnectionPool extends TypedEmitter<ConnectionEvents> {
  private readonly reconnect: boolean;
  private readonly reconnectIntervalMs: number;
  private readonly reconnectMaxIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxPayloadBytes: number;
  private readonly WebSocketImpl?: typeof WebSocket;
  private readonly logger?: ClientLogger;
  private readonly headerDefaults: ForwardConnectionPoolOptions['headerDefaults'];
  private readonly connections = new Map<string, ForwardConnection>();

  constructor(options: ForwardConnectionPoolOptions) {
    super();
    this.reconnect = options.reconnect;
    this.reconnectIntervalMs = options.reconnectIntervalMs;
    this.reconnectMaxIntervalMs = options.reconnectMaxIntervalMs;
    this.connectTimeoutMs = options.connectTimeoutMs;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs;
    this.maxPayloadBytes = options.maxPayloadBytes;
    this.WebSocketImpl = options.WebSocketImpl;
    this.logger = options.logger;
    this.headerDefaults = options.headerDefaults;

    for (const connection of options.connections) {
      this.addConnectionInternal(connection);
    }
  }

  list(): string[] {
    return [...this.connections.keys()];
  }

  hasConnection(selfName: string): boolean {
    return this.connections.has(selfName);
  }

  isOpen(selfName?: string): boolean {
    if (selfName) {
      return this.connections.get(selfName)?.isOpen() ?? false;
    }
    for (const connection of this.connections.values()) {
      if (connection.isOpen()) {
        return true;
      }
    }
    return false;
  }

  async connect(selfName?: string): Promise<void> {
    if (selfName) {
      const connection = this.requireConnection(selfName);
      await connection.connect();
      return;
    }
    await Promise.all([...this.connections.values()].map((connection) => connection.connect()));
  }

  async waitForOpen(timeoutMs: number, selfName?: string): Promise<void> {
    if (selfName) {
      const connection = this.requireConnection(selfName);
      await connection.waitForOpen(timeoutMs);
      return;
    }
    if (this.connections.size === 1) {
      const [connection] = this.connections.values();
      await connection.waitForOpen(timeoutMs);
      return;
    }
    throw new Error('Multiple connections configured. Specify selfName.');
  }

  async close(code = 1000, reason = 'client closing', selfName?: string): Promise<void> {
    if (selfName) {
      const connection = this.requireConnection(selfName);
      await connection.close(code, reason);
      return;
    }
    await Promise.all([...this.connections.values()].map((connection) => connection.close(code, reason)));
  }

  async send(payload: string, selfName: string): Promise<void> {
    const connection = this.requireConnection(selfName);
    await connection.send(payload);
  }

  add(config: ForwardConnectionConfig): void {
    const normalized = normalizeForwardConnection(config, this.headerDefaults);
    this.addConnectionInternal(normalized);
  }

  async remove(selfName: string, code = 1000, reason = 'client closing'): Promise<void> {
    const connection = this.connections.get(selfName);
    if (!connection) {
      return;
    }
    await connection.close(code, reason);
    connection.removeAllListeners();
    this.connections.delete(selfName);
  }

  private addConnectionInternal(config: NormalizedForwardConnection): void {
    if (this.connections.has(config.selfName)) {
      throw new Error(`Duplicate x-self-name: ${config.selfName}`);
    }

    const connection = new ForwardConnection({
      url: config.url,
      headers: config.headers,
      reconnect: this.reconnect,
      reconnectIntervalMs: this.reconnectIntervalMs,
      reconnectMaxIntervalMs: this.reconnectMaxIntervalMs,
      connectTimeoutMs: this.connectTimeoutMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      maxPayloadBytes: this.maxPayloadBytes,
      WebSocketImpl: this.WebSocketImpl,
      logger: this.logger,
    });

    this.connections.set(config.selfName, connection);
    connection.on('open', () => this.emit('open', config.selfName));
    connection.on('close', (code, reason) => this.emit('close', config.selfName, code, reason));
    connection.on('message', (data) => this.emit('message', config.selfName, data));
    connection.on('error', (error) => this.emit('error', config.selfName, error));
    connection.on('reconnect', (attempt, delayMs) =>
      this.emit('reconnect', config.selfName, attempt, delayMs),
    );
  }

  private requireConnection(selfName: string): ForwardConnection {
    const connection = this.connections.get(selfName);
    if (!connection) {
      throw new Error(`Unknown connection: ${selfName}`);
    }
    return connection;
  }
}
