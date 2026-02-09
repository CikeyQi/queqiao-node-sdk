import type WebSocket from 'ws';
import type { ClientLogger } from '../types.js';
import { normalizeError } from '../utils.js';

export type HeartbeatOptions = {
  intervalMs: number;
  timeoutMs: number;
};

export function startHeartbeat(
  ws: WebSocket,
  options: HeartbeatOptions,
  logger?: ClientLogger,
): () => void {
  if (options.intervalMs <= 0) {
    return () => {};
  }

  let lastPong = Date.now();
  const handlePong = () => {
    lastPong = Date.now();
  };

  ws.on('pong', handlePong);

  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      return;
    }
    const now = Date.now();
    if (options.timeoutMs > 0 && now - lastPong > options.timeoutMs) {
      logger?.warn?.('WebSocket heartbeat timeout', { timeoutMs: options.timeoutMs });
      ws.terminate();
      return;
    }

    try {
      ws.ping();
    } catch (error) {
      logger?.warn?.('WebSocket ping failed', { error: normalizeError(error) });
    }
  }, options.intervalMs);

  timer.unref?.();

  return () => {
    clearInterval(timer);
    ws.off('pong', handlePong);
  };
}
