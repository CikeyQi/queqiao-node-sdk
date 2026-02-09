import { QueQiaoClient } from './client.js';
import type { ClientOptions, ForwardConnectionConfig, ReverseServerOptions } from './types.js';

type ClientOverrides = Omit<ClientOptions, 'url' | 'mode' | 'server' | 'connections'>;
type MultiForwardOverrides = Omit<ClientOverrides, 'accessToken'>;

export function createClient(url: string, overrides?: ClientOverrides): QueQiaoClient;
export function createClient(
  connections: ForwardConnectionConfig[],
  overrides?: MultiForwardOverrides,
): QueQiaoClient;
export function createClient(
  options: ForwardConnectionConfig[] | string,
  overrides?: ClientOverrides | MultiForwardOverrides,
): QueQiaoClient {
  if (typeof options === 'string') {
    return new QueQiaoClient({ url: options, ...(overrides ?? {}) });
  }
  return new QueQiaoClient({ connections: options, ...(overrides ?? {}) });
}

export function createReverseClient(
  server: ReverseServerOptions,
  overrides?: ClientOverrides,
): QueQiaoClient {
  return new QueQiaoClient({ mode: 'reverse', server, ...(overrides ?? {}) });
}

export async function connectClient(
  url: string,
  overrides?: ClientOverrides,
): Promise<QueQiaoClient>;
export async function connectClient(
  connections: ForwardConnectionConfig[],
  overrides?: MultiForwardOverrides,
): Promise<QueQiaoClient>;
export async function connectClient(
  options: ForwardConnectionConfig[] | string,
  overrides?: ClientOverrides | MultiForwardOverrides,
): Promise<QueQiaoClient> {
  const client = typeof options === 'string'
    ? createClient(options, overrides as ClientOverrides | undefined)
    : createClient(options, overrides as MultiForwardOverrides | undefined);
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
