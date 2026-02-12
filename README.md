# QueQiao Node SDK

面向 Node.js / TypeScript 的 QueQiao Protocol V2 SDK。  
用于把你的应用接入 `QueQiao`，统一处理 WebSocket 连接、API 调用、事件分发与回声匹配。

## 适用范围

- 协议：`QueQiao Protocol V2`
- API 文档对应：QueQiao `v0.2.11+`
- 事件文档对应：QueQiao `v0.3.0+`

## 安装与环境

```bash
npm install @cikeyqi/queqiao-node-sdk
```

- Node.js `>= 18.18`
- 包为 ESM（CommonJS 请使用动态导入）

```js
const { createClient } = await import('@cikeyqi/queqiao-node-sdk');
```

## 先配置 QueQiao 服务端

以正向连接（SDK 主动连 QueQiao）为例，QueQiao 侧至少确认这些配置：

```yaml
server_name: "Server"
access_token: "your-token" # 可留空，留空表示不校验鉴权

websocket_server:
  enable: true
  host: "127.0.0.1"
  port: 8080
```

对应到握手 Header：
- `x-self-name` 必须与 `server_name` 一致
- `Authorization: Bearer <token>` 对应 `access_token`
- `x-client-origin` 建议填写来源；本 SDK 会固定注入为 `queqiao-node-sdk`

## 连接模式选择

- `forward`：SDK 主动连接 QueQiao 的 WebSocket Server（最常见）
- `reverse`：SDK 启动 WebSocket Server，等待 QueQiao 反连

## 快速开始（forward 单连接）

```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient('ws://127.0.0.1:8080', {
  selfName: 'Server',
  accessToken: 'your-token',
});

client.on('open', () => {
  console.log('connected');
});

client.on('player_chat', async (event) => {
  console.log(`[${event.server_name}] ${event.player.nickname}: ${event.message}`);
});

const resp = await client.request('broadcast', {
  message: [{ text: 'Hello from Node SDK', color: 'green' }],
});

if (resp.status !== 'SUCCESS') {
  console.error('broadcast failed:', resp);
}
```

说明：
- `request` 默认会自动触发连接（`autoConnect: true`）
- 若你希望启动阶段就显式建立连接，调用 `await client.connect()`

## 多服务器接入（forward 多连接）

```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient([
  { url: 'ws://127.0.0.1:8080', selfName: 'Survival', accessToken: 'token-a' },
  { url: 'ws://127.0.0.1:8081', selfName: 'Lobby' },
]);

await client.connect();

await client.request(
  'send_rcon_command',
  { command: 'list' },
  { selfName: 'Survival', timeoutMs: 5000 },
);
```

注意：
- 多连接请求时必须传 `options.selfName`

## 反向连接（reverse）

当 QueQiao 作为 WebSocket Client 反连时使用。  
QueQiao 侧需启用 `websocket_client` 并指向你的 SDK 地址。

```ts
import { createReverseClient } from '@cikeyqi/queqiao-node-sdk';

const client = createReverseClient(
  { host: '0.0.0.0', port: 6700, path: '/minecraft/ws' },
  { accessToken: 'reverse-token' },
);

client.on('connection_open', (selfName) => {
  console.log('reverse connected:', selfName);
});

await client.connect();
await client.request(
  'broadcast',
  { message: [{ text: 'reverse hello' }] },
  { selfName: 'ServerA' },
);
```

## API 调用

统一入口：

```ts
client.request(api, data, options?)
```

`RequestOptions`：

```ts
interface RequestOptions {
  echo?: string;
  timeoutMs?: number;
  selfName?: string;
}
```

已内置类型映射（`KnownApi`）：

| API | data |
| --- | --- |
| `broadcast` | `{ message: MinecraftTextComponent }` |
| `send_private_msg` | `{ uuid?: string \| null; nickname?: string \| null; message: MinecraftTextComponent }` |
| `send_actionbar` | `{ message: MinecraftTextComponent }` |
| `send_title` | `{ title?: MinecraftTextComponent; subtitle?: MinecraftTextComponent; fade_in?: number; stay?: number; fade_out?: number }` |
| `send_rcon_command` | `{ command: string }` |

重点行为：
- SDK 只负责请求/响应匹配，`status === 'FAILED'` 不会自动抛错
- 业务层请自行检查返回的 `code` / `status` / `message`

## 事件监听

事件会以三种事件名分发：

- `event`：总线事件（通配）
- `event_name`：如 `PlayerChatEvent`
- `sub_type`：如 `player_chat`

示例：

```ts
client.on('event', (e) => {
  console.log('all events:', e.event_name);
});

client.on('PlayerJoinEvent', (e) => {
  console.log('join:', e.player.nickname);
});

client.on('player_command', (e) => {
  console.log('command:', e.command);
});
```

## 连接事件

- `open`
- `close`
- `reconnect`
- `error`
- `connection_open`
- `connection_close`
- `connection_reconnect`
- `connection_error`

建议：
- 建议始终监听 `error` 与 `connection_error`，便于记录协议解析异常与连接异常。

## 连接管理

除 `request` 外，客户端还提供以下连接管理方法：

```ts
await client.connect({ selfName? });
await client.close({ code?, reason?, selfName? });
client.isOpen({ selfName? });
client.list();
client.status();
client.add(config); // 仅 forward 模式
await client.remove({ selfName, code?, reason? });
```

行为说明：
- `list()`：返回当前连接名列表（forward 为已配置连接；reverse 为当前在线反连）
- `status()`：返回 `{ selfName, open }[]`，用于统一查看每个连接状态
- `isOpen()`：不传 `selfName` 时表示“是否至少有一个连接处于 open”
- `add()`：仅 forward 可用；reverse 调用会抛错
- `remove()`：forward 会移除并关闭该连接；reverse 会关闭该 `selfName` 当前连接
- `connect` / `close` / `isOpen` / `remove` 统一使用对象参数，避免位置参数歧义
- 多连接场景下，`request` 仍需传 `options.selfName`

## 模式参数约束

- `forward` 可用：`url`、`connections`、`headers`、`selfName`、`accessToken`、`reconnect*`
- `reverse` 可用：`server`、`accessToken`、`strictHeaders`、`rejectDuplicateOrigin`
- `reverse` 不接受：`url`、`connections`、`headers`、`selfName`、`reconnect*`
- forward 多连接（`connections`）时，不接受全局 `selfName` / `accessToken`，请逐连接设置

## 常用配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `mode` | `forward` | 连接模式 |
| `reconnect` | `true` | forward 断线自动重连 |
| `reconnectIntervalMs` | `1000` | 重连初始间隔 |
| `reconnectMaxIntervalMs` | `30000` | 重连最大间隔 |
| `connectTimeoutMs` | `10000` | 连接超时 |
| `heartbeatIntervalMs` | `0` | 心跳间隔，`0` 为关闭 |
| `heartbeatTimeoutMs` | `0` | 心跳超时；当开启心跳且此项为 `0` 时自动取 `2 * heartbeatIntervalMs` |
| `requestTimeoutMs` | `15000` | 请求超时 |
| `maxPendingRequests` | `1000` | 最大待响应请求数，`0` 为不限制 |
| `maxPayloadBytes` | `0` | WebSocket 最大消息体，`0` 为不限制 |
| `autoConnect` | `true` | 请求前自动尝试建连 |
| `strictHeaders` | `true` | reverse 模式下严格校验握手 Header（关闭后若配置了 `accessToken`，仍会校验 `Authorization`） |
| `rejectDuplicateOrigin` | `true` | reverse 模式下拒绝重复来源连接 |

## 工厂方法

- `createClient(url, overrides?)`
- `createClient(connections, overrides?)`
- `connectClient(url, overrides?)`
- `connectClient(connections, overrides?)`
- `createReverseClient(server, overrides?)`
- `connectReverseClient(server, overrides?)`

`connect*` 会在创建后自动执行 `connect()`。

## 导出项

```ts
import {
  QueQiaoClient,
  createClient,
  connectClient,
  createReverseClient,
  connectReverseClient,
} from '@cikeyqi/queqiao-node-sdk';
```

完整类型（事件、请求、响应、配置）都可从包根导入。
