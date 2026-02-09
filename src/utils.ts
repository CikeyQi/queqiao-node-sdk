import type { ApiResponse, QueQiaoEvent } from './types.js';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

export function normalizeOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} cannot be empty`);
  }
  return trimmed;
}

export function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value, field);
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

export function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return clampSafeInt(value);
}

export function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return clampSafeInt(value);
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function assertPort(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${field} must be a valid port number (0-65535)`);
  }
  return value;
}

export function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isApiResponse(value: unknown): value is ApiResponse {
  return (
    isPlainObject(value) &&
    value.post_type === 'response' &&
    typeof value.api === 'string' &&
    typeof value.code === 'number' &&
    typeof value.status === 'string' &&
    typeof value.message === 'string'
  );
}

export function isEvent(value: unknown): value is QueQiaoEvent {
  return (
    isPlainObject(value) &&
    (value.post_type === 'message' || value.post_type === 'notice') &&
    typeof value.timestamp === 'number' &&
    typeof value.event_name === 'string'
  );
}

function clampSafeInt(value: number): number {
  const floored = Math.floor(value);
  return floored > MAX_SAFE_INTEGER ? MAX_SAFE_INTEGER : floored;
}
