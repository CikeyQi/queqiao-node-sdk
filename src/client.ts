import type WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
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
import {
  isApiResponse,
  isEvent,
  isPlainObject,
  normalizeError,
  normalizeOptionalString,
  normalizePositiveInt,
  requireNonEmptyString,
  safeJsonParse,
} from './utils.js';

export class QueQiaoClient extends TypedEmitter<ClientEvents> {
  private readonly logger?: ClientLogger;
  private readonly autoConnect: boolean;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly mode: ConnectionMode;

  private readonly connection: ReturnType<typeof createConnection>;
  private readonly pending: PendingRequests;
  private readonly echoPrefix = randomUUID().slice(0, 8);
  private echoSeq = 0;
  private readonly openConnections = new Set<string>();
  private readonly decoder = new TextDecoder();

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
    let closeError: Error | undefined;
    try {
      await this.connection.close(code, reason, selfName);
    } catch (error) {
      closeError = normalizeError(error);
    } finally {
      if (selfName) {
        this.pending.rejectByConnection(selfName, new Error('WebSocket connection closed'));
      } else {
        this.pending.rejectAll(new Error('WebSocket connection closed'));
      }
    }
    if (closeError) {
      throw closeError;
    }
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
    const selfName = await this.resolveSelfName(
      normalizeOptionalString(options?.selfName, 'options.selfName'),
    );
    await this.ensureReady(selfName);

    const echo = normalizeOptionalString(options?.echo, 'options.echo') ?? this.nextEcho(selfName);
    const timeoutMs = normalizePositiveInt(options?.timeoutMs, this.requestTimeoutMs);
    const normalizedApi = requireNonEmptyString(api, 'api');
    if (!isPlainObject(data)) {
      throw new Error('data must be an object');
    }
    const payload: ApiRequest<TData> = { api: normalizedApi, data, echo };

    const pending = this.pending.create<TResp>(echo, timeoutMs, normalizedApi, selfName);

    try {
      await this.connection.send(JSON.stringify(payload), selfName);
    } catch (error) {
      const normalized = normalizeError(error);
      this.pending.cancel(echo, normalized, selfName);
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
    return `${this.echoPrefix}-${selfName}-${this.echoSeq}`;
  }

  private handleMessage(selfName: string, data: WebSocket.RawData): void {
    const text = this.rawDataToString(data);
    if (!this.looksLikeJson(text)) {
      const error = new Error('Received non-JSON message');
      this.logger?.warn?.('Failed to parse message', { error, text, selfName });
      this.emit('error', error);
      return;
    }
    const parsed = safeJsonParse(text);
    if (!parsed.ok) {
      this.logger?.warn?.('Failed to parse message', { error: parsed.error, text, selfName });
      this.emit('error', parsed.error);
      return;
    }
    const payload = parsed.value;

    if (isApiResponse(payload)) {
      const echo = payload.echo;
      if (echo && this.pending.resolve(echo, payload, selfName)) {
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

  private async resolveSelfName(selfName?: string): Promise<string> {
    if (selfName) {
      return selfName;
    }
    const pickSingle = (): string | undefined => {
      const connections = this.connection.list();
      if (connections.length === 1) {
        return connections[0];
      }
      if (connections.length > 1) {
        throw new Error('Multiple connections detected. Specify options.selfName.');
      }
      return undefined;
    };

    const resolved = pickSingle();
    if (resolved) {
      return resolved;
    }

    if (this.mode !== 'reverse') {
      throw new Error('No connections configured.');
    }
    if (!this.autoConnect) {
      throw new Error('No reverse connections available. Wait for a reverse client to connect.');
    }

    await this.connection.waitForOpen(this.connectTimeoutMs);
    const after = pickSingle();
    if (after) {
      return after;
    }
    throw new Error('No reverse connections available. Wait for a reverse client to connect.');
  }

  private rawDataToString(data: WebSocket.RawData): string {
    if (typeof data === 'string') {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return data.toString();
    }
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return '';
      }
      if (data.length === 1) {
        return data[0]?.toString() ?? '';
      }
      return Buffer.concat(data).toString();
    }
    if (data instanceof ArrayBuffer) {
      return this.decoder.decode(data);
    }
    if (ArrayBuffer.isView(data)) {
      return this.decoder.decode(data);
    }
    return String(data);
  }

  private looksLikeJson(text: string): boolean {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0xfeff) {
        continue;
      }
      return code === 0x7b || code === 0x5b; // { or [
    }
    return false;
  }
}
