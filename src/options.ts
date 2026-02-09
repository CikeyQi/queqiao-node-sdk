import { buildHeaders, normalizeHeaderValue } from './headers.js';
import type {
  ClientOptions,
  ConnectionMode,
  ForwardConnectionConfig,
  HeaderPolicy,
  ReverseServerOptions,
} from './types.js';

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
};
const DEFAULT_SELF_NAME = 'default';

export function normalizeClientOptions(options: ClientOptions): NormalizedClientOptions {
  if (!options) {
    throw new Error('ClientOptions is required');
  }

  const mode = options.mode ?? DEFAULTS.mode;
  if (mode !== 'forward' && mode !== 'reverse') {
    throw new Error(`Invalid mode: ${mode}`);
  }
  if (typeof options.selfName === 'string' && !options.selfName.trim()) {
    throw new Error('selfName cannot be empty');
  }
  if (typeof options.accessToken === 'string' && !options.accessToken.trim()) {
    throw new Error('accessToken cannot be empty');
  }

  const hasForwardConnections = Array.isArray(options.connections) && options.connections.length > 0;
  if (mode === 'reverse') {
    if (options.url || hasForwardConnections) {
      throw new Error('Reverse mode does not accept url or connections');
    }
  } else if (options.server) {
    throw new Error('Forward mode does not accept server options');
  }

  const requestTimeoutMs = options.requestTimeoutMs ?? options.echoTimeoutMs;
  const strictHeaders = options.strictHeaders ?? DEFAULTS.strictHeaders;
  const rejectDuplicateOrigin = options.rejectDuplicateOrigin ?? DEFAULTS.rejectDuplicateOrigin;
  if (mode === 'forward' && hasForwardConnections && options.accessToken) {
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
    selfName: hasForwardConnections ? undefined : options.selfName,
    accessToken: hasForwardConnections ? undefined : options.accessToken,
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

  if (mode === 'reverse') {
    if (!options.server || !options.server.port) {
      throw new Error('ClientOptions.server.port is required for reverse mode');
    }
  }

  const headerPolicy: HeaderPolicy = {
    strict: strictHeaders,
    expectedSelfName: mode === 'reverse' ? undefined : options.selfName,
    expectedAccessToken: options.accessToken,
  };

  return {
    mode,
    forwardConnections,
    server: options.server,
    headerPolicy,
    rejectDuplicateOrigin,
    headerDefaults,
    reconnect: options.reconnect ?? DEFAULTS.reconnect,
    reconnectIntervalMs: normalizePositiveInt(options.reconnectIntervalMs, DEFAULTS.reconnectIntervalMs),
    reconnectMaxIntervalMs: normalizePositiveInt(options.reconnectMaxIntervalMs, DEFAULTS.reconnectMaxIntervalMs),
    connectTimeoutMs: normalizePositiveInt(options.connectTimeoutMs, DEFAULTS.connectTimeoutMs),
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    requestTimeoutMs: normalizePositiveInt(requestTimeoutMs, DEFAULTS.requestTimeoutMs),
    maxPendingRequests: normalizeNonNegativeInt(options.maxPendingRequests, DEFAULTS.maxPendingRequests),
    maxPayloadBytes: normalizeNonNegativeInt(options.maxPayloadBytes, DEFAULTS.maxPayloadBytes),
    autoConnect: options.autoConnect ?? DEFAULTS.autoConnect,
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
  if (!input || !input.url) {
    throw new Error('Forward connection requires url');
  }

  const mergedHeaders = mergeHeaders(defaults.headers, input.headers);
  const mergedNormalized = normalizeHeaderValue(mergedHeaders);
  const resolvedSelfName =
    input.selfName ??
    defaults.selfName ??
    (mergedNormalized['x-self-name'] ? undefined : fallbackSelfName);

  const headers = buildHeaders({
    headers: mergedHeaders,
    selfName: resolvedSelfName,
    accessToken: input.accessToken ?? defaults.accessToken,
  });

  const selfName = headers['x-self-name'];
  if (!selfName || !selfName.trim()) {
    throw new Error('Header x-self-name is required for forward connections');
  }
  return {
    selfName,
    url: input.url,
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
  if (!base && !override) {
    return {};
  }
  if (!base) {
    return { ...(override ?? {}) };
  }
  if (!override) {
    return { ...base };
  }
  return { ...base, ...override };
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    return fallback;
  }
  return Math.floor(value as number);
}

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    return fallback;
  }
  return Math.floor(value as number);
}
