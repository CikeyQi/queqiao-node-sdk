import type { ApiResponse } from './types.js';

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
    if (this.maxRequests > 0 && this.pending.size >= this.maxRequests) {
      throw new Error(`Too many pending requests (max ${this.maxRequests})`);
    }
    if (this.pending.has(echo)) {
      throw new Error(`Duplicate echo value: ${echo}`);
    }

    return new Promise<ApiResponse<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`Request timeout after ${timeoutMs}ms: ${api}`));
      }, timeoutMs);

      this.pending.set(echo, {
        resolve: (response) => resolve(response as ApiResponse<T>),
        reject,
        timeout,
        connection,
      });
    });
  }

  resolve(echo: string, response: ApiResponse): boolean {
    const handler = this.pending.get(echo);
    if (!handler) {
      return false;
    }
    clearTimeout(handler.timeout);
    this.pending.delete(echo);
    handler.resolve(response);
    return true;
  }

  cancel(echo: string, error: Error): void {
    const handler = this.pending.get(echo);
    if (!handler) {
      return;
    }
    this.clearHandler(echo, handler, error);
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
    handler.reject(error);
  }
}
