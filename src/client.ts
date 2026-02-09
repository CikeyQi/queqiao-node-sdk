import type WebSocket from 'ws';
import { createConnection } from './connection/factory.js';
import { TypedEmitter } from './emitter.js';
import { normalizeClientOptions } from './options.js';
import { PendingRequests } from './pending.js';
import type {
  ApiRequest,
  ApiResponse,
  ClientEvents,
  ClientLogger,
  ClientOptions,
  ConnectionMode,
  ForwardConnectionConfig,
  ApiRequestDataMap,
  ApiResponseDataMap,
  KnownApi,
  QueQiaoEvent,
  RequestOptions,
} from './types.js';
import { isApiResponse, isEvent, normalizeError } from './utils.js';

export class QueQiaoClient extends TypedEmitter<ClientEvents> {
  private readonly logger?: ClientLogger;
  private readonly autoConnect: boolean;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly mode: ConnectionMode;

  private readonly connection: ReturnType<typeof createConnection>;
  private readonly pending: PendingRequests;
  private echoSeq = 0;
  private readonly openConnections = new Set<string>();

  constructor(options: ClientOptions) {
    super();
    const resolved = normalizeClientOptions(options);
    this.logger = resolved.logger;
    this.autoConnect = resolved.autoConnect;
    this.requestTimeoutMs = resolved.requestTimeoutMs;
    this.connectTimeoutMs = resolved.connectTimeoutMs;
    this.mode = resolved.mode;
    this.connection = createConnection(resolved);
    this.pending = new PendingRequests(resolved.maxPendingRequests);

    this.connection.on('open', (selfName) => this.handleOpen(selfName));
    this.connection.on('reconnect', (selfName, attempt, delayMs) => {
      this.emit('connection_reconnect', selfName, attempt, delayMs);
      this.emit('reconnect', attempt, delayMs);
    });
    this.connection.on('error', (selfName, error) => {
      const normalized = normalizeError(error);
      this.emit('connection_error', selfName, normalized);
      this.emit('error', normalized);
    });
    this.connection.on('close', (selfName, code, reason) => this.handleClose(selfName, code, reason));
    this.connection.on('message', (selfName, data: WebSocket.RawData) => this.handleMessage(selfName, data));
  }

  async connect(selfName?: string): Promise<void> {
    await this.connection.connect(selfName);
  }

  async close(code = 1000, reason = 'client closing', selfName?: string): Promise<void> {
    await this.connection.close(code, reason, selfName);
    if (selfName) {
      this.pending.rejectByConnection(selfName, new Error('WebSocket connection closed'));
      return;
    }
    this.pending.rejectAll(new Error('WebSocket connection closed'));
  }

  isOpen(selfName?: string): boolean {
    return this.connection.isOpen(selfName);
  }

  list(): string[] {
    return this.connection.list();
  }

  add(config: ForwardConnectionConfig): void {
    if (this.mode !== 'forward') {
      throw new Error('add is only available in forward mode');
    }
    if (!this.connection.add) {
      throw new Error('add is not supported');
    }
    this.connection.add(config);
  }

  async remove(selfName: string, code = 1000, reason = 'client closing'): Promise<void> {
    if (this.connection.remove) {
      await this.connection.remove(selfName, code, reason);
      return;
    }
    await this.connection.close(code, reason, selfName);
  }

  request<K extends KnownApi>(
    api: K,
    data: ApiRequestDataMap[K],
    options?: RequestOptions,
  ): Promise<ApiResponse<ApiResponseDataMap[K]>>;
  async request<TData extends object, TResp = unknown>(
    api: string,
    data: TData,
    options?: RequestOptions,
  ): Promise<ApiResponse<TResp>> {
    const selfName = this.resolveSelfName(options?.selfName);
    await this.ensureReady(selfName);

    const echo = options?.echo ?? this.nextEcho(selfName);
    const timeoutMs = options?.timeoutMs ?? this.requestTimeoutMs;
    const payload: ApiRequest<TData> = { api, data, echo };

    const pending = this.pending.create<TResp>(echo, timeoutMs, api, selfName);

    try {
      await this.connection.send(JSON.stringify(payload), selfName);
    } catch (error) {
      const normalized = normalizeError(error);
      this.pending.cancel(echo, normalized);
      throw normalized;
    }

    return pending;
  }

  private async ensureReady(selfName: string): Promise<void> {
    if (this.connection.isOpen(selfName)) {
      return;
    }
    if (!this.autoConnect) {
      throw new Error('WebSocket is not open. Call connect() first.');
    }
    await this.connection.waitForOpen(this.connectTimeoutMs, selfName);
  }

  private nextEcho(selfName: string): string {
    this.echoSeq = (this.echoSeq + 1) % 1_000_000;
    return `${selfName}-${Date.now()}-${this.echoSeq}`;
  }

  private handleMessage(selfName: string, data: WebSocket.RawData): void {
    const text = typeof data === 'string' ? data : data.toString();
    let payload: unknown;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      const normalized = normalizeError(error);
      this.logger?.warn?.('Failed to parse message', { error: normalized, text, selfName });
      this.emit('error', normalized);
      return;
    }

    if (isApiResponse(payload)) {
      const echo = payload.echo;
      if (echo && this.pending.resolve(echo, payload)) {
        return;
      }
      this.logger?.debug?.('Unmatched response payload', { payload, selfName });
      return;
    }

    if (isEvent(payload)) {
      this.emitEvent('event', payload);
      this.emitEvent(payload.event_name, payload);
      if (payload.sub_type) {
        this.emitEvent(payload.sub_type, payload);
      }
      return;
    }

    this.logger?.debug?.('Unknown message payload', { payload, selfName });
  }

  private emitEvent(name: string, payload: QueQiaoEvent): void {
    (super.emit as (event: string, payload: QueQiaoEvent) => boolean)(name, payload);
  }

  private handleOpen(selfName: string): void {
    this.openConnections.add(selfName);
    this.emit('connection_open', selfName);
    if (this.openConnections.size === 1) {
      this.emit('open');
    }
  }

  private handleClose(selfName: string, code: number, reason: string): void {
    this.emit('connection_close', selfName, code, reason);
    this.pending.rejectByConnection(selfName, new Error('WebSocket connection closed'));
    if (this.connection.isOpen(selfName)) {
      return;
    }
    this.openConnections.delete(selfName);
    if (this.openConnections.size === 0) {
      this.emit('close', code, reason);
    }
  }

  private resolveSelfName(selfName?: string): string {
    if (selfName) {
      return selfName;
    }
    const connections = this.connection.list();
    if (connections.length === 1) {
      return connections[0];
    }
    if (connections.length === 0) {
      throw new Error('No connections configured.');
    }
    throw new Error('Multiple connections detected. Specify options.selfName.');
  }
}
