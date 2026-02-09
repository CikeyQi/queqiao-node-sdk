import type { HeaderPolicy } from './types.js';
import { normalizeError } from './utils.js';

export type NormalizedHeaders = Record<string, string>;

const SDK_CLIENT_ORIGIN = 'queqiao-node-sdk';

export function buildHeaders(input: {
  headers?: Record<string, string>;
  selfName?: string;
  accessToken?: string;
}): NormalizedHeaders {
  const base = normalizeHeaderValue(input.headers ?? {});

  if (typeof input.selfName === 'string' && !input.selfName.trim()) {
    throw normalizeError(new Error('selfName cannot be empty'));
  }
  if (typeof input.accessToken === 'string' && !input.accessToken.trim()) {
    throw normalizeError(new Error('accessToken cannot be empty'));
  }

  if (input.selfName) {
    const selfName = input.selfName.trim();
    assertHeaderMatch(base, 'x-self-name', selfName);
    base['x-self-name'] = selfName;
  }

  assertHeaderMatch(base, 'x-client-origin', SDK_CLIENT_ORIGIN);
  base['x-client-origin'] = SDK_CLIENT_ORIGIN;

  if (input.accessToken) {
    const token = normalizeBearer(input.accessToken);
    assertHeaderMatch(base, 'authorization', token);
    base['authorization'] = token;
  }

  return base;
}

export function validateNormalizedHeaders(
  normalized: NormalizedHeaders,
  policy: HeaderPolicy,
): { ok: boolean; reason?: string } {
  if (!policy.strict) {
    return { ok: true };
  }

  const selfName = normalized['x-self-name'];

  if (!selfName) {
    return { ok: false, reason: 'missing x-self-name header' };
  }

  if (policy.expectedSelfName && policy.expectedSelfName !== selfName) {
    return { ok: false, reason: 'x-self-name mismatch' };
  }

  if (policy.expectedAccessToken) {
    if (!matchAuthorization(policy.expectedAccessToken, normalized['authorization'])) {
      return { ok: false, reason: 'authorization mismatch' };
    }
  }

  return { ok: true };
}

export function matchAuthorization(expectedToken: string, incoming?: string): boolean {
  const expected = normalizeBearer(expectedToken);
  const incomingToken = incoming ? normalizeBearer(incoming) : undefined;
  return incomingToken === expected;
}

export function normalizeHeaderValue(
  headers: import('node:http').IncomingHttpHeaders | Record<string, string>,
): NormalizedHeaders {
  const normalized: NormalizedHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }
    const lowered = key.toLowerCase();
    const raw = Array.isArray(value) ? value[0] ?? '' : value.toString();
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    normalized[lowered] = trimmed;
  }

  return normalized;
}

function assertHeaderMatch(headers: NormalizedHeaders, key: string, value: string): void {
  if (!headers[key]) {
    return;
  }
  if (key === 'authorization') {
    const left = normalizeBearer(headers[key]);
    const right = normalizeBearer(value);
    if (left !== right) {
      throw normalizeError(new Error(`Header conflict: ${key}`));
    }
    return;
  }
  if (headers[key] !== value) {
    throw normalizeError(new Error(`Header conflict: ${key}`));
  }
}

function normalizeBearer(token: string): string {
  const trimmed = token.trim();
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return `Bearer ${trimmed.slice(7).trim()}`;
  }
  return `Bearer ${trimmed}`;
}
