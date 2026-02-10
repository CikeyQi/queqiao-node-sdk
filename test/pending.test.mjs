import assert from 'node:assert/strict';
import test from 'node:test';
import { PendingRequests } from '../dist/pending.js';

test('pending request resolves by echo and connection', async () => {
  const pending = new PendingRequests(10);
  const response = {
    code: 0,
    api: 'broadcast',
    post_type: 'response',
    status: 'SUCCESS',
    message: 'ok',
    echo: 'e1',
  };

  const promise = pending.create('e1', 1000, 'broadcast', 'A');
  assert.equal(pending.resolve('e1', response, 'A'), true);
  await assert.doesNotReject(promise);
});

test('duplicate pending echo in same connection is rejected', async () => {
  const pending = new PendingRequests(10);
  const first = pending.create('dup', 1000, 'broadcast', 'A');
  assert.throws(() => pending.create('dup', 1000, 'broadcast', 'A'), /Duplicate echo value: dup/);
  pending.cancel('dup', new Error('cleanup'), 'A');
  await assert.rejects(first, /cleanup/);
});

test('rejectByConnection only rejects matching connection', async () => {
  const pending = new PendingRequests(10);
  const first = pending.create('a1', 1000, 'broadcast', 'A');
  const second = pending.create('b1', 1000, 'broadcast', 'B');

  pending.rejectByConnection('A', new Error('A closed'));
  await assert.rejects(first, /A closed/);

  const response = {
    code: 0,
    api: 'broadcast',
    post_type: 'response',
    status: 'SUCCESS',
    message: 'ok',
    echo: 'b1',
  };
  assert.equal(pending.resolve('b1', response, 'B'), true);
  await assert.doesNotReject(second);
});

test('pending request times out', async () => {
  const pending = new PendingRequests(10);
  const timed = pending.create('timeout', 10, 'broadcast', 'A');
  await assert.rejects(timed, /Request timeout after 10ms: A\/broadcast/);
});
