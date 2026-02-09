# QueQiao Node SDK

QueQiao Protocol V2 的 Node.js/TypeScript SDK，提供正向与反向 WebSocket 接入、请求回声匹配、事件分发、连接治理和完整类型提示。

## 核心能力

- 支持 `forward`（主动连接）与 `reverse`（监听反连）两种模式
- 统一请求模型：`client.request(api, data, options)`
- 内建心跳、重连、连接超时、请求超时
- 多连接池管理（按 `selfName` 路由）
- Header 规范化与鉴权校验
- 强类型事件分发（总线事件 + 事件名 + 子类型）
- 严格 TypeScript 编译与可回归单元测试

## 安装

```bash
npm install @cikeyqi/queqiao-node-sdk
```

## 运行环境

- Node.js 18+
- ESM（CommonJS 请使用动态导入）

```js
const { createClient } = await import('@cikeyqi/queqiao-node-sdk');
```

## 快速开始

### 正向单连接

```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient('ws://127.0.0.1:6700', {
  selfName: 'ServerA',
  accessToken: 'token-123',
});

client.on('open', () => {
  console.log('connected');
});

await client.request('broadcast', {
  message: [{ text: 'Hello QueQiao', color: 'green' }],
});
```

### 正向多连接

```ts
import { createClient } from '@cikeyqi/queqiao-node-sdk';

const client = createClient([
  { url: 'ws://127.0.0.1:6700', selfName: 'A', accessToken: 'token-a' },
  { url: 'ws://127.0.0.1:6701', selfName: 'B', accessToken: 'token-b' },
]);

await client.connect();

await client.request(
  'send_rcon_command',
  { command: 'list' },
  { selfName: 'A', timeoutMs: 5000 },
);
```

### 反向模式（监听反连）

```ts
import { createReverseClient } from '@cikeyqi/queqiao-node-sdk';

const client = createReverseClient(
  { port: 6700, path: '/ws' },
  { accessToken: 'reverse-token' },
);

client.on('connection_open', (selfName) => {
  console.log('reverse connected:', selfName);
});

await client.connect();
await client.request('broadcast', { message: [{ text: 'Welcome' }] }, { selfName: 'ServerA' });
```

## 工厂方法

- `createClient(url, overrides?)`
- `createClient(connections, overrides?)`
- `connectClient(url, overrides?)`
- `connectClient(connections, overrides?)`
- `createReverseClient(server, overrides?)`
- `connectReverseClient(server, overrides?)`

说明：
- `connect*` 会在创建后自动执行 `connect()`。
- 多连接模式下，`overrides` 不允许全局 `accessToken`，必须在每个连接项中配置。

## QueQiaoClient API

- `connect(selfName?)`
- `close(code?, reason?, selfName?)`
- `isOpen(selfName?)`
- `list()`
- `add(config)`（仅 `forward`）
- `remove(selfName, code?, reason?)`
- `request(api, data, options?)`

### request 选项

```ts
interface RequestOptions {
  echo?: string;
  timeoutMs?: number;
  selfName?: string;
}
```

行为约束：
- `api` 必须是非空字符串
- `data` 必须是对象
- 多连接场景必须指定 `options.selfName`
- 未指定 `echo` 时，SDK 自动生成唯一 echo

## 事件模型

客户端会发出三类业务事件名：

- `event`（通配总线）
- 协议事件名（如 `PlayerChatEvent`）
- 协议子类型（如 `player_chat`）

连接维度事件：

- `open`
- `close`
- `reconnect`
- `error`
- `connection_open`
- `connection_close`
- `connection_reconnect`
- `connection_error`

## 内置 API 类型映射

| API | 请求 data | 响应 data |
| --- | --- | --- |
| `broadcast` | `{ message: MinecraftTextComponent }` | `void` |
| `send_private_msg` | `{ uuid?: string \| null; nickname?: string \| null; message: MinecraftTextComponent }` | `{ target_player: Player; message: string } \| null` |
| `send_actionbar` | `{ message: MinecraftTextComponent }` | `void` |
| `send_title` | `{ title?: MinecraftTextComponent; subtitle?: MinecraftTextComponent; fade_in?: number; stay?: number; fade_out?: number }` | `void` |
| `send_rcon_command` | `{ command: string }` | `string` |

## 配置说明

`ClientOptions` 关键字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'forward' \| 'reverse'` | `forward` | 连接模式 |
| `url` | `string` | - | 正向单连接地址 |
| `connections` | `ForwardConnectionConfig[]` | - | 正向多连接配置 |
| `server` | `{ port; host?; path? }` | - | 反向监听配置 |
| `headers` | `Record<string, string>` | `{}` | 自定义 Header |
| `selfName` | `string` | 单连接缺省为 `Server` | 默认 `x-self-name` |
| `accessToken` | `string` | - | 默认鉴权 token |
| `strictHeaders` | `boolean` | `true` | 反向模式严格 Header 校验 |
| `rejectDuplicateOrigin` | `boolean` | `true` | 反向模式拒绝冲突来源 |
| `reconnect` | `boolean` | `true` | 正向自动重连 |
| `reconnectIntervalMs` | `number` | `1000` | 重连初始间隔 |
| `reconnectMaxIntervalMs` | `number` | `30000` | 重连最大间隔（自动不小于初始间隔） |
| `connectTimeoutMs` | `number` | `10000` | 连接超时 |
| `heartbeatIntervalMs` | `number` | `0` | 心跳间隔，`0` 表示关闭 |
| `heartbeatTimeoutMs` | `number` | `0` | 心跳超时，`0` 时自动取 `2 * heartbeatIntervalMs` |
| `requestTimeoutMs` | `number` | `15000` | 请求超时 |
| `echoTimeoutMs` | `number` | - | 兼容字段，优先级低于 `requestTimeoutMs` |
| `maxPendingRequests` | `number` | `1000` | 最大并发待响应请求，`0` 表示不限制 |
| `maxPayloadBytes` | `number` | `0` | WebSocket 最大消息体，`0` 表示不限制 |
| `autoConnect` | `boolean` | `true` | 请求前自动建立连接 |
| `WebSocketImpl` | `typeof WebSocket` | `ws` | 自定义 WebSocket 实现 |
| `logger` | `ClientLogger` | - | 自定义日志钩子 |

## Header 与鉴权策略

SDK 统一处理以下 Header：

- `x-self-name`：连接标识（必需）
- `authorization`：由 `accessToken` 规范化为 `Bearer <token>`
- `x-client-origin`：固定注入 `queqiao-node-sdk`

校验规则：

- 严格模式下（默认）校验 `x-self-name` 与 `authorization`
- 可选拒绝重复 `x-client-origin`，防止来源冲突

## 错误处理约定

- 输入参数错误：同步抛出 `Error`
- 连接失败/超时：`connect` 或 `request` Promise reject
- 请求超时：按 `timeoutMs` 或全局超时 reject
- 连接断开：自动 reject 该连接上的所有未完成请求

建议：

- 对 `request` 使用 `try/catch`
- 监听 `error` 与 `connection_error`
- 多连接场景为每个请求显式传入 `selfName`

## 开发与质量保障

```bash
npm run build   # TypeScript 构建
npm run test    # 单元测试（node:test）
npm run lint    # ESLint
npm run format  # Prettier
```

当前单测覆盖模块：

- `headers`（规范化、冲突检测、鉴权匹配）
- `options`（模式校验、默认值、约束规则）
- `pending`（超时、去重、按连接回收）
- `utils`（类型守卫与基础校验）

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

完整类型（事件、请求/响应、配置等）均可从包根直接导入。
