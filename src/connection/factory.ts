import type { NormalizedClientOptions } from '../options.js';
import type { Connection } from './types.js';
import { ForwardConnectionPool } from './forward-pool.js';
import { ReverseConnection } from './reverse.js';

export function createConnection(options: NormalizedClientOptions): Connection {
  if (options.mode === 'reverse') {
    if (!options.server) {
      throw new Error('Reverse connection requires server options');
    }
    return new ReverseConnection({
      server: options.server,
      headerPolicy: options.headerPolicy,
      rejectDuplicateOrigin: options.rejectDuplicateOrigin,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs,
      maxPayloadBytes: options.maxPayloadBytes,
      WebSocketImpl: options.WebSocketImpl,
      logger: options.logger,
    });
  }

  return new ForwardConnectionPool({
    connections: options.forwardConnections,
    headerDefaults: options.headerDefaults,
    reconnect: options.reconnect,
    reconnectIntervalMs: options.reconnectIntervalMs,
    reconnectMaxIntervalMs: options.reconnectMaxIntervalMs,
    connectTimeoutMs: options.connectTimeoutMs,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    heartbeatTimeoutMs: options.heartbeatTimeoutMs,
    maxPayloadBytes: options.maxPayloadBytes,
    WebSocketImpl: options.WebSocketImpl,
    logger: options.logger,
  });
}
