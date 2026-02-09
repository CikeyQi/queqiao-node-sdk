import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHeaders,
  matchAuthorization,
  normalizeHeaderValue,
  validateNormalizedHeaders,
} from '../dist/headers.js';

test('buildHeaders injects fixed headers and normalizes authorization', () => {
  const headers = buildHeaders({
    headers: {
      'X-Self-Name': 'Server-A',
      Authorization: 'token-1',
    },
    accessToken: 'Bearer token-1',
  });

  assert.equal(headers['x-self-name'], 'Server-A');
  assert.equal(headers['x-client-origin'], 'queqiao-node-sdk');
  assert.equal(headers.authorization, 'Bearer token-1');
});

test('buildHeaders rejects conflicting authorization', () => {
  assert.throws(
    () =>
      buildHeaders({
        headers: { authorization: 'Bearer token-1' },
        accessToken: 'token-2',
      }),
    /Header conflict: authorization/,
  );
});

test('validateNormalizedHeaders enforces strict policy', () => {
  const normalized = normalizeHeaderValue({
    'x-self-name': 'Server-A',
    authorization: 'token-1',
  });
  const allowed = validateNormalizedHeaders(normalized, {
    strict: true,
    expectedSelfName: 'Server-A',
    expectedAccessToken: 'Bearer token-1',
  });
  assert.equal(allowed.ok, true);

  const denied = validateNormalizedHeaders(normalized, {
    strict: true,
    expectedSelfName: 'Server-B',
    expectedAccessToken: 'token-1',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'x-self-name mismatch');
});

test('matchAuthorization ignores bearer case and spacing', () => {
  assert.equal(matchAuthorization('token-1', 'Bearer   token-1'), true);
  assert.equal(matchAuthorization('token-1', 'bearer token-2'), false);
});
