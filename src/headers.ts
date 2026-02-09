import type { IncomingHttpHeaders } from 'node:http';
import type { HeaderPolicy } from './types.js';
import { normalizeError, normalizeOptionalString } from './utils.js';

export type NormalizedHeaders = Record<string, string>;

const HEADER_SELF_NAME = 'x-self-name';
const HEADER_CLIENT_ORIGIN = 'x-client-origin';
const HEADER_AUTHORIZATION = 'authorization';
const SDK_CLIENT_ORIGIN = 'queqiao-node-sdk';

export function buildHeaders(input: {
  headers?: Record<string, string>;
  selfName?: string;
  accessToken?: string;
}): NormalizedHeaders {
  const base = normalizeHeaderValue(input.headers ?? {});

  const selfName = normalizeOptionalString(input.selfName, 'selfName');
  const accessToken = normalizeOptionalString(input.accessToken, 'accessToken');

  if (selfName) {
    assertHeaderMatch(base, HEADER_SELF_NAME, selfName);
    base[HEADER_SELF_NAME] = selfName;
  }

  assertHeaderMatch(base, HEADER_CLIENT_ORIGIN, SDK_CLIENT_ORIGIN);
  base[HEADER_CLIENT_ORIGIN] = SDK_CLIENT_ORIGIN;

  if (accessToken) {
    const token = normalizeBearer(accessToken);
    assertHeaderMatch(base, HEADER_AUTHORIZATION, token);
    base[HEADER_AUTHORIZATION] = token;
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

  const selfName = normalized[HEADER_SELF_NAME];

  if (!selfName) {
    return { ok: false, reason: `missing ${HEADER_SELF_NAME} header` };
  }

  if (policy.expectedSelfName && policy.expectedSelfName !== selfName) {
    return { ok: false, reason: `${HEADER_SELF_NAME} mismatch` };
  }

  if (policy.expectedAccessToken) {
    if (!matchAuthorization(policy.expectedAccessToken, normalized[HEADER_AUTHORIZATION])) {
      return { ok: false, reason: `${HEADER_AUTHORIZATION} mismatch` };
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
  headers: IncomingHttpHeaders | Record<string, string>,
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
  if (key === HEADER_AUTHORIZATION) {
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
