import { QueQiaoClient } from './client.js';
import type {
  ForwardClientOptions,
  ForwardConnectionConfig,
  ReverseClientOptions,
  ReverseServerOptions,
} from './types.js';

type SingleForwardOverrides = Omit<ForwardClientOptions, 'mode' | 'url' | 'connections'>;
type MultiForwardOverrides = Omit<SingleForwardOverrides, 'accessToken' | 'selfName'>;
type ReverseOverrides = Omit<ReverseClientOptions, 'mode' | 'server'>;
type ForwardInput = string | ForwardConnectionConfig[];

export function createClient(input: string, overrides?: SingleForwardOverrides): QueQiaoClient;
export function createClient(
  input: ForwardConnectionConfig[],
  overrides?: MultiForwardOverrides,
): QueQiaoClient;
export function createClient(
  input: ForwardInput,
  overrides?: SingleForwardOverrides | MultiForwardOverrides,
): QueQiaoClient {
  if (typeof input === 'string') {
    return new QueQiaoClient({
      mode: 'forward',
      url: input,
      ...((overrides ?? {}) as SingleForwardOverrides),
    });
  }
  return new QueQiaoClient({
    mode: 'forward',
    connections: input,
    ...((overrides ?? {}) as MultiForwardOverrides),
  });
}

export function createReverseClient(
  server: ReverseServerOptions,
  overrides?: ReverseOverrides,
): QueQiaoClient {
  return new QueQiaoClient({ mode: 'reverse', server, ...(overrides ?? {}) });
}

export function connectClient(input: string, overrides?: SingleForwardOverrides): Promise<QueQiaoClient>;
export function connectClient(
  input: ForwardConnectionConfig[],
  overrides?: MultiForwardOverrides,
): Promise<QueQiaoClient>;
export async function connectClient(
  input: ForwardInput,
  overrides?: SingleForwardOverrides | MultiForwardOverrides,
): Promise<QueQiaoClient> {
  const client =
    typeof input === 'string'
      ? createClient(input, overrides as SingleForwardOverrides)
      : createClient(input, overrides as MultiForwardOverrides);
  await client.connect();
  return client;
}

export async function connectReverseClient(
  server: ReverseServerOptions,
  overrides?: ReverseOverrides,
): Promise<QueQiaoClient> {
  const client = createReverseClient(server, overrides);
  await client.connect();
  return client;
}
