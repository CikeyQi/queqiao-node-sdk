import { QueQiaoClient } from './client.js';
import type { ClientOptions, ForwardConnectionConfig, ReverseServerOptions } from './types.js';

type ClientOverrides = Omit<ClientOptions, 'url' | 'mode' | 'server' | 'connections'>;
type MultiForwardOverrides = Omit<ClientOverrides, 'accessToken'>;
type ForwardInput = string | ForwardConnectionConfig[];
type ForwardOverrides<TInput extends ForwardInput> = TInput extends string
  ? ClientOverrides
  : MultiForwardOverrides;

export function createClient<TInput extends ForwardInput>(
  input: TInput,
  overrides?: ForwardOverrides<TInput>,
): QueQiaoClient {
  if (typeof input === 'string') {
    return new QueQiaoClient({ url: input, ...(overrides ?? {}) });
  }
  return new QueQiaoClient({ connections: input, ...(overrides ?? {}) });
}

export function createReverseClient(
  server: ReverseServerOptions,
  overrides?: ClientOverrides,
): QueQiaoClient {
  return new QueQiaoClient({ mode: 'reverse', server, ...(overrides ?? {}) });
}

export async function connectClient<TInput extends ForwardInput>(
  input: TInput,
  overrides?: ForwardOverrides<TInput>,
): Promise<QueQiaoClient> {
  const client = createClient(input, overrides);
  await client.connect();
  return client;
}

export async function connectReverseClient(
  server: ReverseServerOptions,
  overrides?: ClientOverrides,
): Promise<QueQiaoClient> {
  const client = createReverseClient(server, overrides);
  await client.connect();
  return client;
}
