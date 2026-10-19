import type { Disposer, Resource } from "./activation";
import type { Logger } from "./logger";
import type { Schema } from "./schema";

/**
 * Every service, by name. Each provider adds its own by augmenting this
 * module (`declare module "@workshop/core" { interface Services { … } }`),
 * so consumers depend on the service's interface, never on the provider.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extended by declaration merging
export interface Services {}

/** Every typed event, by name, added the same way as `Services`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extended by declaration merging
export interface Events {}

export type ServiceName = keyof Services & string;

export type EventName = keyof Events & string;

export type EventFunction<K extends keyof Events> = Events[K] extends (
  ...args: infer A
) => infer R
  ? (...args: A) => R
  : never;

/** The services a plugin reads. Required ones gate its start; optional ones may be absent. */
export interface Inject {
  readonly required?: readonly ServiceName[];
  readonly optional?: readonly ServiceName[];
}

/** A plugin: a named unit that reads services, provides services and owns effects. */
export interface Plugin<C = void> {
  readonly name: string;
  readonly inject?: Inject;
  /** Services this plugin publishes; providing any other one throws. */
  readonly provides?: readonly ServiceName[];
  /** Validates and defaults the configuration before `apply` sees it. */
  readonly config?: Schema<C>;
  apply(ctx: Context, config: C): void | Promise<void>;
  /** Apply a new configuration in place; return false to restart instead. */
  reconfigure?(ctx: Context, config: C): boolean;
}

export type PluginState =
  /** Waiting for required services, or for its parent to finish starting. */
  | "pending"
  | "loading"
  | "active"
  /** `apply` threw; stays failed until `update` gives it a new configuration. */
  | "failed"
  | "disposed";

/** A started plugin, as its starter sees it. */
export interface PluginHandle<C = unknown> {
  readonly definition: Plugin<C>;
  readonly state: PluginState;
  /** Required services that are missing. */
  readonly waitingFor: readonly ServiceName[];
  readonly error: unknown;
  readonly config: C;
  /** The current activation's context, while one exists. */
  readonly context: Context | undefined;
  /** Validate `config`, then reconfigure in place or restart. */
  update(config: C): Promise<void>;
  /** Stop for good; every caller waits for the same teardown. */
  dispose(): Promise<void>;
}

/**
 * What a plugin works through. Injected services are readable as properties
 * (`ctx.editor`); reading an undeclared one throws. Everything registered
 * through a context is undone, last first, when its activation stops.
 */
export interface BaseContext {
  /** The owning plugin's name, as logs and the resource ledger show it. */
  readonly owner: string;
  readonly logger: Logger;
  /** False once this activation is stopping; late registrations are refused. */
  readonly isLive: boolean;
  /**
   * Run `setup` now and undo what it returns when this context stops.
   * Returns an early release, which a later stop joins.
   */
  effect(setup: () => Disposer | Resource, kind?: string): Disposer;
  /**
   * Hold an existing resource until this context stops; returns its early
   * release. On a stopped context the resource is undone at once and this
   * throws, which is how late work from an abandoned start is cleaned up.
   */
  acquire(kind: string, resource: Disposer | Resource): Disposer;
  /** `acquire` for a disposable that the caller keeps using: returns it. */
  own<T extends Resource>(resource: T, kind?: string): T;
  /** Publish a service. Consumers see it once this plugin has started. */
  provide<K extends ServiceName>(name: K, value: Services[K]): void;
  /** Start a child plugin, owned (and stopped) by this context. */
  plugin<C>(definition: Plugin<C>, config?: C): PluginHandle<C>;
  on<K extends keyof Events>(
    name: K,
    listener: EventFunction<K>,
    options?: { prepend?: boolean },
  ): Disposer;
  /** Call listeners without waiting; a throwing listener is logged and skipped. */
  emit<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): void;
  /** Await listeners one after another. */
  serial<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void>;
  /** Await listeners concurrently. */
  parallel<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void>;
  /** The first listener returning something other than undefined claims the event. */
  bail<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): ReturnType<EventFunction<K>> | undefined;
  /** Each listener may transform the value; listeners run in order and are awaited. */
  pipeline<K extends keyof Events>(
    name: K,
    value: Parameters<EventFunction<K>>[0],
  ): Promise<Parameters<EventFunction<K>>[0]>;
  /** Make `settled()` also wait for this work. */
  track(work: Promise<unknown>): void;
  /** Resolves once every start, stop and tracked job in this tree is done. */
  settled(): Promise<void>;
  /** Composition rank of a plugin (lower ranks go first). */
  rankOf(owner: string): number;
}

export type Context = BaseContext & Services;

/** The root of a plugin tree: owns every top-level plugin and shuts down for good. */
export interface RootContext extends BaseContext {
  readonly plugins: readonly PluginHandle[];
  /** Read a started service from outside the tree (bootstrap code, diagnostics, tests). */
  service<K extends ServiceName>(name: K): Services[K] | undefined;
  /** Which plugin provides each published service, for diagnostics. */
  readonly providers: ReadonlyMap<ServiceName, string>;
  readonly ledger: { snapshot(): Record<string, Record<string, number>> };
  dispose(): Promise<void>;
}
