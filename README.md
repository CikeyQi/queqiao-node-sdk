# QueQiao Node.js SDK (Protocol V2)

面向鹊桥 Protocol V2 的 Node.js SDK，提供正向/反向 WebSocket 连接、请求回声匹配、事件分发与完整 TypeScript 类型提示。

## 功能
- 正向与反向 WebSocket 连接
- 单连接与多连接统一调用
- Header 规范与鉴权校验
- 自动重连与心跳
- 请求超时与并发控制
- 事件分发与类型提示

## 兼容性
- API 协议: V2 (服务端插件/Mod v0.2.11+)
- 事件协议: V2 (服务端插件/Mod v0.3.0+)

## 安装
```bash
npm install @cikeyqi/queqiao-node-sdk
```

## 运行环境
SDK 以 ESM 形式发布，CommonJS 项目需要使用动态导入：
```js
const { createClient } = await import('@cikeyqi/queqiao-node-sdk');
```

## 快速开始

### 正向单连接
```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient('ws://127.0.0.1:6700', {
  selfName: 'ServerA',
  accessToken: '123',
});

client.on('open', () => {
  console.log('connected');
});

await client.request('broadcast', { message: [{ text: 'Hello', color: 'green' }] });
```
说明：单连接未传 `selfName` 时，SDK 会自动使用 `default` 作为 `x-self-name`。

### 正向多连接
```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient([
  { url: 'ws://127.0.0.1:6700', selfName: 'ServerA', accessToken: 'token-a' },
  { url: 'ws://127.0.0.1:6701', selfName: 'ServerB', accessToken: 'token-b' },
]);

await client.request('broadcast', { message: [{ text: 'Hello' }] }, { selfName: 'ServerA' });
```

### 反向模式
```ts
import { createReverseClient } from '@cikeyqi/queqiao-node-sdk';

const client = createReverseClient({ port: 6700 }, { accessToken: 'secret-token' });

client.on('connection_open', (name) => {
  console.log('connected:', name);
});

await client.connect();
await client.request('broadcast', { message: [{ text: 'Welcome' }] }, { selfName: 'ServerA' });
```
说明：反向模式 `accessToken` 可选，设置后连接方必须携带正确的 `Authorization` 才能建立连接。

## 创建与连接方式
仅保留 4 种创建方法，避免过度分散：
1. 正向快捷连接：`connectClient(url, options)`
2. 正向全功能连接：`createClient(url | connections, options)`
3. 反向快捷连接：`connectReverseClient(server, options)`
4. 反向全功能连接：`createReverseClient(server, options)`

```ts
import {
  createClient,
  connectClient,
  createReverseClient,
  connectReverseClient,
} from '@cikeyqi/queqiao-node-sdk';

const a = await connectClient('ws://127.0.0.1:6700', { selfName: 'ServerA' });

const b = createClient('ws://127.0.0.1:6700', { selfName: 'ServerA' });
const c = createClient([
  { url: 'ws://127.0.0.1:6700', selfName: 'ServerA' },
  { url: 'ws://127.0.0.1:6701', selfName: 'ServerB' },
]);

const d = await connectReverseClient({ port: 6700 }, { accessToken: 'secret-token' });
const e = createReverseClient({ port: 6700 });
```

## 统一调用方式
仅提供 `client.request(api, data, options)`。
多连接场景必须提供 `options.selfName`，单连接可以省略。

常用 API 示例：
```ts
await client.request('broadcast', { message: [{ text: 'Hello' }] });
await client.request('send_private_msg', { nickname: 'Steve', message: [{ text: 'Hi' }] });
await client.request('send_actionbar', { message: [{ text: 'Tip' }] });
await client.request('send_title', { title: { text: 'Title' }, subtitle: { text: 'Sub' } });
await client.request('send_rcon_command', { command: 'list' });
```

自定义 API 示例：
```ts
type CustomResp = { ok: boolean; detail?: string };
const res = await client.request<{ foo: string }, CustomResp>('custom_api', { foo: 'bar' });
console.log(res.data?.ok);
```

内置类型提示的常用 API：
| API | data 结构 | 返回 data |
| --- | --- | --- |
| `broadcast` | `{ message: MinecraftTextComponent }` | `unknown` |
| `send_private_msg` | `{ uuid?: string; nickname?: string; message: MinecraftTextComponent }` | `unknown` |
| `send_actionbar` | `{ message: MinecraftTextComponent }` | `unknown` |
| `send_title` | `{ title?: MinecraftTextComponent; subtitle?: MinecraftTextComponent; fade_in?: number; stay?: number; fade_out?: number }` | `unknown` |
| `send_rcon_command` | `{ command: string }` | `string` |

## 连接管理
```ts
client.list();
client.add({ url: 'ws://127.0.0.1:6702', selfName: 'ServerC' });
await client.remove('ServerB');
await client.connect('ServerA');
await client.close(1000, 'closing', 'ServerA');
```
说明：`list()` 返回已配置或已连接的 `selfName` 列表。
说明：`add/remove` 仅正向模式可用；反向模式由连接方发起连接。
说明：`connect/close` 可指定 `selfName`，不指定则对全部连接生效。

## 事件监听
SDK 会分发三类事件名：
- `event`
- 事件名，例如 `PlayerChatEvent`
- 子类型，例如 `player_chat`

```ts
client.on('event', (event) => {});
client.on('PlayerChatEvent', (event) => {});
client.on('player_command', (event) => {});
```

连接维度事件：
- `connection_open`
- `connection_close`
- `connection_reconnect`
- `connection_error`

事件列表 (V2)：
- `PlayerChatEvent`
- `PlayerCommandEvent`
- `PlayerJoinEvent`
- `PlayerQuitEvent`
- `PlayerDeathEvent`
- `PlayerAchievementEvent`

## Header 规则
- `x-self-name`：正向与反向均为必填。单连接未传时会自动使用 `default`。
- `authorization`：由 `accessToken` 生成，设置后会进行鉴权。
- `x-client-origin`：固定为 `@cikeyqi/queqiao-node-sdk`，不支持自定义。

## 配置
`ClientOptions` 适用于 `new QueQiaoClient(options)`，也是各创建方法的配置子集。
| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'forward' \| 'reverse'` | `forward` | 连接模式 |
| `url` | `string` | - | 正向单连接地址 |
| `connections` | `ForwardConnectionConfig[]` | - | 正向多连接列表 |
| `server` | `{ port: number; host?: string; path?: string }` | - | 反向服务端配置 |
| `headers` | `Record<string, string>` | `{}` | 自定义 Header |
| `selfName` | `string` | - | 正向单连接 `x-self-name` |
| `accessToken` | `string` | - | `Authorization` Header |
| `strictHeaders` | `boolean` | `true` | 反向模式 Header 严格校验 |
| `rejectDuplicateOrigin` | `boolean` | `true` | 反向模式拒绝重复 `x-client-origin` |
| `reconnect` | `boolean` | `true` | 正向自动重连 |
| `reconnectIntervalMs` | `number` | `1000` | 重连初始间隔 |
| `reconnectMaxIntervalMs` | `number` | `30000` | 重连最大间隔 |
| `connectTimeoutMs` | `number` | `10000` | 连接超时 |
| `heartbeatIntervalMs` | `number` | `0` | 心跳间隔，`0` 关闭 |
| `heartbeatTimeoutMs` | `number` | `0` | 心跳超时，`0` 表示 `2 * interval` |
| `requestTimeoutMs` | `number` | `15000` | 请求超时 |
| `echoTimeoutMs` | `number` | - | 兼容字段，优先级低于 `requestTimeoutMs` |
| `maxPendingRequests` | `number` | `1000` | 最大并发请求数，`0` 不限制 |
| `maxPayloadBytes` | `number` | `0` | 最大消息体，`0` 不限制 |
| `autoConnect` | `boolean` | `true` | 发送前自动连接 |
| `WebSocketImpl` | `typeof WebSocket` | `ws` | 自定义 WebSocket 实现 |
| `logger` | `ClientLogger` | - | 日志输出 |

说明：正向模式同时提供 `connections` 与 `url` 时，优先使用 `connections`。
说明：反向模式仅使用 `server`，若同时提供 `url` 或 `connections` 会抛错。
说明：正向多连接如需鉴权，请在每个连接中设置 `accessToken`，不允许使用顶层 `accessToken` 或 `headers.Authorization`。
说明：反向模式 `accessToken` 可选，设置后连接方必须携带正确的 `Authorization`，即使 `strictHeaders` 为 `false` 也会校验。
说明：`headers` 中若与 `selfName/accessToken` 冲突会抛错，避免误配置。

`ForwardConnectionConfig`：
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 连接地址 |
| `selfName` | `string` | `x-self-name` |
| `accessToken` | `string` | 连接级别 token |
| `headers` | `Record<string, string>` | 连接级别自定义 Header |

`RequestOptions`：
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `echo` | `string` | 自定义回声 |
| `timeoutMs` | `number` | 单次请求超时 |
| `selfName` | `string` | 多连接目标 |

## 错误处理
- 连接失败或超时会抛出异常
- 请求超时会 reject 对应 Promise
- 连接断开会 reject 该连接上的待完成请求

## FAQ
- `Header x-self-name is required`：正向连接必须设置 `selfName`，单连接会默认使用 `default`
- `authorization mismatch`：连接携带的 `Authorization` 与配置不一致
- `duplicate client origin`：反向连接检测到重复 `x-client-origin`

## 导出内容
```ts
import {
  QueQiaoClient,
  createClient,
  connectClient,
  createReverseClient,
  connectReverseClient,
  ApiResponse,
  PlayerChatEvent,
} from '@cikeyqi/queqiao-node-sdk';
```
