import type WebSocket from 'ws';
import type { TypedEmitter } from '../emitter.js';

export type ConnectionEvents = {
  open: [selfName: string];
  close: [selfName: string, code: number, reason: string];
  message: [selfName: string, data: WebSocket.RawData];
  error: [selfName: string, error: Error];
  reconnect: [selfName: string, attempt: number, delayMs: number];
};

export type Connection = TypedEmitter<ConnectionEvents> & {
  isOpen(selfName?: string): boolean;
  connect(selfName?: string): Promise<void>;
  waitForOpen(timeoutMs: number, selfName?: string): Promise<void>;
  close(code?: number, reason?: string, selfName?: string): Promise<void>;
  send(payload: string, selfName: string): Promise<void>;
  list(): string[];
  add?: (config: import('../types.js').ForwardConnectionConfig) => void;
  remove?: (selfName: string, code?: number, reason?: string) => Promise<void>;
};
