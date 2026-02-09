import { EventEmitter } from 'node:events';

export type EventMap = Record<string | symbol, unknown[]>;

export class TypedEmitter<Events extends EventMap> extends EventEmitter<Events> {}
