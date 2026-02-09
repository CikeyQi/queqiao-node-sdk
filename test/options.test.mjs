import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeClientOptions } from '../dist/options.js';

test('single forward connection falls back to default selfName', () => {
  const options = normalizeClientOptions({
    url: 'ws://127.0.0.1:6700',
  });

  assert.equal(options.mode, 'forward');
  assert.equal(options.forwardConnections.length, 1);
  assert.equal(options.forwardConnections[0].selfName, 'Server');
  assert.equal(options.forwardConnections[0].headers['x-client-origin'], 'queqiao-node-sdk');
});

test('heartbeat timeout defaults to 2x interval when interval is enabled', () => {
  const options = normalizeClientOptions({
    url: 'ws://127.0.0.1:6700',
    heartbeatIntervalMs: 1200,
  });

  assert.equal(options.heartbeatIntervalMs, 1200);
  assert.equal(options.heartbeatTimeoutMs, 2400);
});

test('forward multi-connection rejects global accessToken', () => {
  assert.throws(
    () =>
      normalizeClientOptions({
        connections: [{ url: 'ws://127.0.0.1:6700', selfName: 'A' }],
        accessToken: 'shared-token',
      }),
    /Forward connections require accessToken per connection/,
  );
});

test('reverse mode requires server configuration', () => {
  assert.throws(
    () =>
      normalizeClientOptions({
        mode: 'reverse',
      }),
    /ClientOptions\.server\.port is required for reverse mode/,
  );
});
