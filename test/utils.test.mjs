import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPort,
  isApiResponse,
  isEvent,
  normalizeNonNegativeInt,
  normalizePositiveInt,
  requireNonEmptyString,
  safeJsonParse,
} from '../dist/utils.js';

test('safeJsonParse returns discriminated result', () => {
  const parsed = safeJsonParse('{"a":1}');
  assert.equal(parsed.ok, true);

  const failed = safeJsonParse('{');
  assert.equal(failed.ok, false);
});

test('isApiResponse and isEvent recognize valid payloads', () => {
  assert.equal(
    isApiResponse({
      code: 0,
      api: 'broadcast',
      post_type: 'response',
      status: 'SUCCESS',
      message: 'ok',
    }),
    true,
  );

  assert.equal(
    isEvent({
      post_type: 'notice',
      event_name: 'PlayerJoinEvent',
      timestamp: Date.now(),
    }),
    true,
  );
});

test('numeric normalizers guard invalid values', () => {
  assert.equal(normalizePositiveInt(3.8, 1), 3);
  assert.equal(normalizePositiveInt(0, 1), 1);
  assert.equal(normalizeNonNegativeInt(5.2, 1), 5);
  assert.equal(normalizeNonNegativeInt(-1, 1), 1);
});

test('requireNonEmptyString and assertPort enforce input validity', () => {
  assert.equal(requireNonEmptyString('  a  ', 'field'), 'a');
  assert.equal(assertPort(65535, 'port'), 65535);
  assert.throws(() => requireNonEmptyString(' ', 'field'), /field cannot be empty/);
  assert.throws(() => assertPort(65536, 'port'), /must be a valid port number/);
});
