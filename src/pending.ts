import type { ApiResponse } from './types.js';
import { normalizeError } from './utils.js';

type PendingHandler = {
  resolve: (value: ApiResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  connection?: string;
};

export class PendingRequests {
  private readonly pending = new Map<string, PendingHandler>();
  private readonly maxRequests: number;

  constructor(maxRequests: number) {
    this.maxRequests = maxRequests;
  }

  create<T>(
    echo: string,
    timeoutMs: number,
    api: string,
    connection?: string,
  ): Promise<ApiResponse<T>> {
    const key = this.getKey(echo, connection);
    if (this.maxRequests > 0 && this.pending.size >= this.maxRequests) {
      throw new Error(`Too many pending requests (max ${this.maxRequests})`);
    }
    if (this.pending.has(key)) {
      throw new Error(`Duplicate echo value: ${echo}`);
    }

    return new Promise<ApiResponse<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        const scope = connection ? `${connection}/${api}` : api;
        reject(new Error(`Request timeout after ${timeoutMs}ms: ${scope}`));
      }, timeoutMs);
      timeout.unref?.();

      this.pending.set(key, {
        resolve: (response) => resolve(response as ApiResponse<T>),
        reject: (error) => reject(normalizeError(error)),
        timeout,
        connection,
      });
    });
  }

  resolve(echo: string, response: ApiResponse, connection?: string): boolean {
    const hit = this.popHandler(echo, connection);
    if (!hit) {
      return false;
    }
    const [, handler] = hit;
    handler.resolve(response);
    return true;
  }

  cancel(echo: string, error: Error, connection?: string): void {
    const hit = this.popHandler(echo, connection);
    if (!hit) {
      return;
    }
    const [, handler] = hit;
    handler.reject(error);
  }

  rejectAll(error: Error): void {
    this.rejectWhere(() => true, error);
  }

  rejectByConnection(connection: string, error: Error): void {
    this.rejectWhere((handler) => handler.connection === connection, error);
  }

  size(): number {
    return this.pending.size;
  }

  private rejectWhere(predicate: (handler: PendingHandler) => boolean, error: Error): void {
    for (const [echo, handler] of this.pending) {
      if (!predicate(handler)) {
        continue;
      }
      this.clearHandler(echo, handler, error);
    }
  }

  private clearHandler(echo: string, handler: PendingHandler, error: Error): void {
    clearTimeout(handler.timeout);
    this.pending.delete(echo);
    handler.reject(normalizeError(error));
  }

  private popHandler(
    echo: string,
    connection?: string,
  ): [key: string, handler: PendingHandler] | undefined {
    const primaryKey = this.getKey(echo, connection);
    let key = primaryKey;
    let handler = this.pending.get(key);
    if (!handler && connection) {
      key = echo;
      handler = this.pending.get(key);
    }
    if (!handler) {
      return undefined;
    }
    clearTimeout(handler.timeout);
    this.pending.delete(key);
    return [key, handler];
  }

  private getKey(echo: string, connection?: string): string {
    return connection ? `${connection}::${echo}` : echo;
  }
}
