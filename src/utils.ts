import type { ApiResponse, QueQiaoEvent } from './types.js';

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isApiResponse(value: unknown): value is ApiResponse {
  return (
    isObject(value) &&
    value.post_type === 'response' &&
    typeof value.api === 'string' &&
    typeof value.code === 'number'
  );
}

export function isEvent(value: unknown): value is QueQiaoEvent {
  return isObject(value) && typeof value.post_type === 'string' && typeof value.event_name === 'string';
}
