import { buildHeaders, normalizeHeaderValue } from './headers.js';
import type {
  ClientOptions,
  ConnectionMode,
  ForwardConnectionConfig,
  HeaderPolicy,
  ReverseServerOptions,
} from './types.js';
import {
  assertPort,
  normalizeBoolean,
  normalizeNonNegativeInt,
  normalizeOptionalString,
  normalizePositiveInt,
  requireNonEmptyString,
} from './utils.js';

export type NormalizedForwardConnection = {
  selfName: string;
  url: string;
  headers: Record<string, string>;
};

export type NormalizedClientOptions = {
  mode: ConnectionMode;
  forwardConnections: NormalizedForwardConnection[];
  server?: ReverseServerOptions;
  headerPolicy: HeaderPolicy;
  rejectDuplicateOrigin: boolean;
  headerDefaults: {
    headers?: Record<string, string>;
    selfName?: string;
    accessToken?: string;
  };
  reconnect: boolean;
  reconnectIntervalMs: number;
  reconnectMaxIntervalMs: number;
  connectTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  requestTimeoutMs: number;
  maxPendingRequests: number;
  maxPayloadBytes: number;
  autoConnect: boolean;
  WebSocketImpl?: ClientOptions['WebSocketImpl'];
  logger?: ClientOptions['logger'];
};

const DEFAULTS = {
  mode: 'forward' as ConnectionMode,
  reconnect: true,
  reconnectIntervalMs: 1000,
  reconnectMaxIntervalMs: 30000,
  connectTimeoutMs: 10000,
  heartbeatIntervalMs: 0,
  heartbeatTimeoutMs: 0,
  requestTimeoutMs: 15000,
  maxPendingRequests: 1000,
  maxPayloadBytes: 0,
  autoConnect: true,
  strictHeaders: true,
  rejectDuplicateOrigin: true,
} as const;
const DEFAULT_SELF_NAME = 'Server';

export function normalizeClientOptions(options: ClientOptions): NormalizedClientOptions {
  if (!options) {
    throw new Error('ClientOptions is required');
  }

  const mode = options.mode ?? DEFAULTS.mode;
  if (mode !== 'forward' && mode !== 'reverse') {
    throw new Error(`Invalid mode: ${mode}`);
  }
  const selfName = normalizeOptionalString(options.selfName, 'selfName');
  const accessToken = normalizeOptionalString(options.accessToken, 'accessToken');

  const hasForwardConnections = Array.isArray(options.connections) && options.connections.length > 0;
  if (mode === 'reverse') {
    if (options.url || hasForwardConnections) {
      throw new Error('Reverse mode does not accept url or connections');
    }
  } else if (options.server) {
    throw new Error('Forward mode does not accept server options');
  }

  const requestTimeoutMs = normalizePositiveInt(
    options.requestTimeoutMs ?? options.echoTimeoutMs,
    DEFAULTS.requestTimeoutMs,
  );
  const strictHeaders = normalizeBoolean(options.strictHeaders, DEFAULTS.strictHeaders);
  const rejectDuplicateOrigin = normalizeBoolean(
    options.rejectDuplicateOrigin,
    DEFAULTS.rejectDuplicateOrigin,
  );
  if (mode === 'forward' && hasForwardConnections && accessToken) {
    throw new Error('Forward connections require accessToken per connection');
  }
  if (mode === 'forward' && hasForwardConnections && options.headers) {
    const normalized = normalizeHeaderValue(options.headers);
    if (normalized['authorization']) {
      throw new Error('Forward connections require accessToken per connection');
    }
  }
  const headerDefaults = {
    headers: options.headers,
    selfName: hasForwardConnections ? undefined : selfName,
    accessToken: hasForwardConnections ? undefined : accessToken,
  };
  const heartbeatIntervalMs = normalizeNonNegativeInt(
    options.heartbeatIntervalMs,
    DEFAULTS.heartbeatIntervalMs,
  );
  let heartbeatTimeoutMs = normalizeNonNegativeInt(
    options.heartbeatTimeoutMs,
    DEFAULTS.heartbeatTimeoutMs,
  );
  if (heartbeatIntervalMs === 0) {
    heartbeatTimeoutMs = 0;
  } else if (heartbeatTimeoutMs === 0) {
    heartbeatTimeoutMs = heartbeatIntervalMs * 2;
  }

  const forwardConnections = mode === 'forward'
    ? normalizeForwardConnections(options, headerDefaults)
    : [];

  const server = mode === 'reverse' ? normalizeServerOptions(options.server) : undefined;
  if (mode === 'reverse' && !server) {
    throw new Error('ClientOptions.server.port is required for reverse mode');
  }

  const headerPolicy: HeaderPolicy = {
    strict: strictHeaders,
    expectedSelfName: mode === 'reverse' ? undefined : selfName,
    expectedAccessToken: accessToken,
  };

  const reconnectIntervalMs = normalizePositiveInt(
    options.reconnectIntervalMs,
    DEFAULTS.reconnectIntervalMs,
  );
  const reconnectMaxIntervalMs = Math.max(
    reconnectIntervalMs,
    normalizePositiveInt(options.reconnectMaxIntervalMs, DEFAULTS.reconnectMaxIntervalMs),
  );

  return {
    mode,
    forwardConnections,
    server,
    headerPolicy,
    rejectDuplicateOrigin,
    headerDefaults,
    reconnect: normalizeBoolean(options.reconnect, DEFAULTS.reconnect),
    reconnectIntervalMs,
    reconnectMaxIntervalMs,
    connectTimeoutMs: normalizePositiveInt(options.connectTimeoutMs, DEFAULTS.connectTimeoutMs),
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    requestTimeoutMs,
    maxPendingRequests: normalizeNonNegativeInt(options.maxPendingRequests, DEFAULTS.maxPendingRequests),
    maxPayloadBytes: normalizeNonNegativeInt(options.maxPayloadBytes, DEFAULTS.maxPayloadBytes),
    autoConnect: normalizeBoolean(options.autoConnect, DEFAULTS.autoConnect),
    WebSocketImpl: options.WebSocketImpl,
    logger: options.logger,
  };
}

export function normalizeForwardConnection(
  input: ForwardConnectionConfig,
  defaults: {
    headers?: Record<string, string>;
    selfName?: string;
    accessToken?: string;
  },
  fallbackSelfName?: string,
): NormalizedForwardConnection {
  const url = requireNonEmptyString(input?.url, 'Forward connection url');
  const explicitSelfName = normalizeOptionalString(input.selfName, 'selfName');
  const explicitAccessToken = normalizeOptionalString(input.accessToken, 'accessToken');

  const mergedHeaders = mergeHeaders(defaults.headers, input.headers);
  const mergedNormalized = normalizeHeaderValue(mergedHeaders);
  const resolvedSelfName =
    explicitSelfName ??
    defaults.selfName ??
    (mergedNormalized['x-self-name'] ? undefined : fallbackSelfName);

  const headers = buildHeaders({
    headers: mergedHeaders,
    selfName: resolvedSelfName,
    accessToken: explicitAccessToken ?? defaults.accessToken,
  });

  const selfName = headers['x-self-name'];
  if (!selfName || !selfName.trim()) {
    throw new Error('Header x-self-name is required for forward connections');
  }
  return {
    selfName,
    url,
    headers,
  };
}

function normalizeForwardConnections(
  options: ClientOptions,
  defaults: {
    headers?: Record<string, string>;
    selfName?: string;
    accessToken?: string;
  },
): NormalizedForwardConnection[] {
  const inputs: ForwardConnectionConfig[] = Array.isArray(options.connections) && options.connections.length > 0
    ? options.connections
    : options.url
      ? [
          {
            url: options.url,
            headers: options.headers,
            selfName: options.selfName,
            accessToken: options.accessToken,
          },
        ]
      : [];

  if (!inputs.length) {
    throw new Error('Forward connections are required for forward mode');
  }

  const isSingle = inputs.length === 1;
  const normalized = inputs.map((item) =>
    normalizeForwardConnection(item, defaults, isSingle ? DEFAULT_SELF_NAME : undefined),
  );
  const seen = new Set<string>();
  for (const item of normalized) {
    if (seen.has(item.selfName)) {
      throw new Error(`Duplicate x-self-name: ${item.selfName}`);
    }
    seen.add(item.selfName);
  }

  return normalized;
}

function mergeHeaders(
  base?: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> {
  return { ...(base ?? {}), ...(override ?? {}) };
}

function normalizeServerOptions(server?: ReverseServerOptions): ReverseServerOptions | undefined {
  if (!server) {
    return undefined;
  }
  const host = normalizeOptionalString(server.host, 'server.host');
  const path = normalizeOptionalString(server.path, 'server.path');
  return {
    port: assertPort(server.port, 'server.port'),
    host,
    path: normalizePath(path),
  };
}

function normalizePath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }
  return path.startsWith('/') ? path : `/${path}`;
}
