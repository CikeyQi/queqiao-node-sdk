import type WebSocket from 'ws';

export type ConnectionMode = 'forward' | 'reverse';

/** Reverse mode server bind options. */
export interface ReverseServerOptions {
  /** Listening port in range 0-65535. */
  port: number;
  /** Bind host, defaults to all interfaces. */
  host?: string;
  /** Optional URL path, for example `/ws`. */
  path?: string;
}

/** Forward WebSocket connection entry. */
export interface ForwardConnectionConfig {
  /** Target WebSocket URL, for example `ws://127.0.0.1:6700`. */
  url: string;
  /** Custom headers merged before SDK required headers. */
  headers?: Record<string, string>;
  /** Server identity, mapped to header `x-self-name`. */
  selfName?: string;
  /** Access token used to build `Authorization: Bearer ...`. */
  accessToken?: string;
}

export type HeaderPolicy = {
  strict: boolean;
  expectedSelfName?: string;
  expectedAccessToken?: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type MinecraftTextComponent = JsonValue;

export interface ApiRequest<TData extends object = JsonObject> {
  api: string;
  data: TData;
  echo?: string;
}

export interface ApiResponse<TData = unknown> {
  code: number;
  api: string;
  post_type: 'response';
  status: 'SUCCESS' | 'FAILED' | string;
  message: string;
  data?: TData;
  echo?: string;
}

export interface Player {
  nickname: string;
  uuid?: string;
  is_op?: boolean;
  address?: string;
  health?: number;
  max_health?: number;
  experience_level?: number;
  experience_progress?: number;
  total_experience?: number;
  walk_speed?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface Translate {
  key: string;
  args?: Translate[];
  text?: string;
}

export interface Death {
  key: string;
  args?: string[];
  text?: string;
}

export interface Display {
  title?: string | Translate;
  description?: string | Translate;
  frame?: 'task' | 'goal' | 'challenge' | string;
}

export interface Achievement {
  key: string;
  display?: Display;
  text?: string;
  translate?: Translate;
}

export interface EventBase {
  timestamp: number;
  post_type: 'message' | 'notice';
  event_name: string;
  server_name?: string;
  server_version?: string;
  server_type?: string;
  sub_type?: string;
}

export interface PlayerChatEvent extends EventBase {
  event_name: 'PlayerChatEvent';
  sub_type: 'player_chat';
  message_id?: string;
  raw_message?: string;
  player: Player;
  message: string;
}

export interface PlayerCommandEvent extends EventBase {
  event_name: 'PlayerCommandEvent';
  sub_type: 'player_command';
  message_id?: string;
  raw_message?: string;
  player: Player;
  command: string;
}

export interface PlayerJoinEvent extends EventBase {
  event_name: 'PlayerJoinEvent';
  sub_type: 'player_join';
  player: Player;
}

export interface PlayerQuitEvent extends EventBase {
  event_name: 'PlayerQuitEvent';
  sub_type: 'player_quit';
  player: Player;
}

export interface PlayerDeathEvent extends EventBase {
  event_name: 'PlayerDeathEvent';
  sub_type: 'player_death';
  player: Player;
  death: Death | Translate;
}

export interface PlayerAchievementEvent extends EventBase {
  event_name: 'PlayerAchievementEvent';
  sub_type: 'player_achievement';
  player: Player;
  achievement: Achievement;
}

export type QueQiaoEvent =
  | PlayerChatEvent
  | PlayerCommandEvent
  | PlayerJoinEvent
  | PlayerQuitEvent
  | PlayerDeathEvent
  | PlayerAchievementEvent;

export type EventName = QueQiaoEvent['event_name'];
export type SubType = QueQiaoEvent['sub_type'];

export interface ClientLogger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

/** SDK client runtime options. */
export interface ClientOptions {
  /** Connection mode. Defaults to `forward`. */
  mode?: ConnectionMode;
  /** Single forward URL shortcut. */
  url?: string;
  /** Forward connection list. */
  connections?: ForwardConnectionConfig[];
  /** Reverse mode server configuration. */
  server?: ReverseServerOptions;
  /** Additional headers merged into handshake headers. */
  headers?: Record<string, string>;
  /** Default self name for single forward connection. */
  selfName?: string;
  /** Default access token for single forward connection or reverse validation. */
  accessToken?: string;
  /** Reverse mode strict header validation. */
  strictHeaders?: boolean;
  /** Reverse mode duplicate origin protection. */
  rejectDuplicateOrigin?: boolean;
  /** Forward mode auto reconnect switch. */
  reconnect?: boolean;
  /** Forward reconnect base interval in milliseconds. */
  reconnectIntervalMs?: number;
  /** Forward reconnect max interval in milliseconds. */
  reconnectMaxIntervalMs?: number;
  /** Connect timeout in milliseconds. */
  connectTimeoutMs?: number;
  /** Heartbeat interval in milliseconds. `0` disables heartbeat. */
  heartbeatIntervalMs?: number;
  /** Heartbeat timeout in milliseconds. */
  heartbeatTimeoutMs?: number;
  /** @deprecated Use `requestTimeoutMs` instead. */
  echoTimeoutMs?: number;
  /** Request timeout in milliseconds. */
  requestTimeoutMs?: number;
  /** Max number of unresolved requests. `0` means unlimited. */
  maxPendingRequests?: number;
  /** WebSocket max payload bytes. `0` means unlimited. */
  maxPayloadBytes?: number;
  /** Automatically connect before sending requests. */
  autoConnect?: boolean;
  /** Custom WebSocket constructor implementation. */
  WebSocketImpl?: typeof WebSocket;
  /** Optional logger hooks. */
  logger?: ClientLogger;
}

export interface RequestOptions {
  /** Custom echo identifier. */
  echo?: string;
  /** Per-request timeout override in milliseconds. */
  timeoutMs?: number;
  /** Target self name when multiple connections are configured. */
  selfName?: string;
}

export interface SendTitleData {
  title?: MinecraftTextComponent;
  subtitle?: MinecraftTextComponent;
  fade_in?: number;
  stay?: number;
  fade_out?: number;
}

export interface SendPrivateMessageData {
  uuid?: string | null;
  nickname?: string | null;
  message: MinecraftTextComponent;
}

export interface SendPrivateMessageResponseData {
  target_player: Player;
  message: string;
}

export interface BroadcastData {
  message: MinecraftTextComponent;
}

export interface SendActionbarData {
  message: MinecraftTextComponent;
}

export interface SendRconCommandData {
  command: string;
}

export type KnownApi =
  | 'broadcast'
  | 'send_private_msg'
  | 'send_actionbar'
  | 'send_title'
  | 'send_rcon_command';

export type ApiRequestDataMap = {
  broadcast: BroadcastData;
  send_private_msg: SendPrivateMessageData;
  send_actionbar: SendActionbarData;
  send_title: SendTitleData;
  send_rcon_command: SendRconCommandData;
};

export type ApiResponseDataMap = {
  broadcast: void;
  send_private_msg: SendPrivateMessageResponseData | null;
  send_actionbar: void;
  send_title: void;
  send_rcon_command: string;
};

export type ApiResponseFor<K extends KnownApi> = ApiResponse<ApiResponseDataMap[K]>;
export type ApiRequestFor<K extends KnownApi> = ApiRequest<ApiRequestDataMap[K]>;

export type ClientEvents = {
  open: [];
  close: [code: number, reason: string];
  reconnect: [attempt: number, delayMs: number];
  error: [error: Error];
  connection_open: [selfName: string];
  connection_close: [selfName: string, code: number, reason: string];
  connection_reconnect: [selfName: string, attempt: number, delayMs: number];
  connection_error: [selfName: string, error: Error];
  event: [event: QueQiaoEvent];
} & { [K in EventName]: [event: Extract<QueQiaoEvent, { event_name: K }>] } & {
  [K in SubType]: [event: Extract<QueQiaoEvent, { sub_type: K }>];
};
