import type { Activation, Disposer, Resource } from "./activation";
import { bindCaller, isCallerBound } from "./caller";
import { CoreError } from "./errors";
import { taggedLogger } from "./logger";
import type { Logger } from "./logger";
import { PluginHandleImpl } from "./plugin-handle";
import type { Runtime } from "./runtime";
import type {
  Context,
  BaseContext,
  EventFunction,
  Events,
  Inject,
  Plugin,
  PluginHandle,
  ServiceName,
  Services,
} from "./types";

/** What differs between a root context and a plugin's context. */
export interface ContextScope {
  readonly owner: string;
  /** Services this context may read; a root context reads none. */
  readonly inject?: Inject;
  /** Services a plugin may publish; a root context publishes anything. */
  readonly provides?: readonly ServiceName[];
  /** Publish a service; returns its withdrawal. */
  publish(name: ServiceName, value: unknown): Disposer;
  /** Start a child now, or once the owner's `apply` has committed. */
  startChild(child: PluginHandleImpl<unknown>): void;
}

/**
 * The context implementation. A Proxy turns property reads of service names
 * into checked service lookups, so plugins write `ctx.editor`.
 */
export class ContextImpl implements BaseContext {
  readonly logger: Logger;
  /** Caller-bound facades, by the service value they were made from. */
  private readonly facades = new Map<unknown, unknown>();

  constructor(
    protected readonly runtime: Runtime,
    protected readonly activation: Activation,
    private readonly scope: ContextScope,
  ) {
    this.logger = taggedLogger(runtime.logger, scope.owner);
    return new Proxy(this, {
      get: (target, key, receiver) => {
        // Promise resolution probes `then` on values it is given.
        if (key === "then") {
          return undefined;
        }
        if (typeof key !== "string" || Reflect.has(target, key)) {
          return Reflect.get(target, key, receiver);
        }
        return target.readService(key as ServiceName, receiver as Context);
      },
    });
  }

  get owner(): string {
    return this.scope.owner;
  }

  get isLive(): boolean {
    return this.activation.isLive;
  }

  effect(setup: () => Disposer | Resource, kind = "effect"): Disposer {
    this.assertLive();
    return this.activation.acquire(kind, setup());
  }

  acquire(kind: string, resource: Disposer | Resource): Disposer {
    return this.activation.acquire(kind, resource);
  }

  own<T extends Resource>(resource: T, kind = "resource"): T {
    this.activation.acquire(kind, resource);
    return resource;
  }

  provide<K extends ServiceName>(name: K, value: Services[K]): void {
    this.assertLive();
    const declared = this.scope.provides;
    if (declared && !declared.includes(name)) {
      throw new CoreError(
        "UndeclaredService",
        `${this.owner} provides ${name} without declaring it`,
      );
    }
    if (value === undefined) {
      throw new CoreError("DuplicateService", `${name} cannot be undefined`);
    }
    let withdraw: Disposer;
    try {
      withdraw = this.scope.publish(name, value);
    } catch (error) {
      throw new CoreError("DuplicateService", name, { cause: error });
    }
    const entry = { owner: this.owner, value };
    this.runtime.published.set(name, entry);
    this.activation.acquire("service", async () => {
      await withdraw();
      if (this.runtime.published.get(name) === entry) {
        this.runtime.published.delete(name);
      }
    });
  }

  plugin<C>(definition: Plugin<C>, config?: C): PluginHandle<C> {
    this.assertLive();
    const child = new PluginHandleImpl(this.runtime, definition, config as C);
    child.detach = this.activation.acquire("plugin", () => child.dispose());
    this.scope.startChild(child as PluginHandleImpl<unknown>);
    return child;
  }

  on<K extends keyof Events>(
    name: K,
    listener: EventFunction<K>,
    options?: { prepend?: boolean },
  ): Disposer {
    return this.effect(
      () =>
        this.runtime.bus.on(name, listener, {
          ...options,
          logger: this.logger,
          owner: this.owner,
        }),
      "listener",
    );
  }

  emit<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): void {
    this.assertLive();
    this.runtime.bus.emit(name, args);
  }

  serial<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void> {
    this.assertLive();
    return this.runtime.bus.serial(name, args);
  }

  parallel<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void> {
    this.assertLive();
    return this.runtime.bus.parallel(name, args);
  }

  bail<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): ReturnType<EventFunction<K>> | undefined {
    this.assertLive();
    return this.runtime.bus.bail(name, args) as
      ReturnType<EventFunction<K>> | undefined;
  }

  pipeline<K extends keyof Events>(
    name: K,
    value: Parameters<EventFunction<K>>[0],
  ): Promise<Parameters<EventFunction<K>>[0]> {
    this.assertLive();
    return this.runtime.bus.pipeline(name, value) as Promise<
      Parameters<EventFunction<K>>[0]
    >;
  }

  track(work: Promise<unknown>): void {
    this.runtime.track(
      work.catch((error: unknown) =>
        this.logger.error("Tracked work failed", error),
      ),
    );
  }

  settled(): Promise<void> {
    return this.runtime.settled();
  }

  /** A property, not a method: callers pass it on as a plain function. */
  readonly rankOf = (owner: string): number => this.runtime.rank(owner);

  protected assertLive(): void {
    if (!this.activation.isLive) {
      throw new CoreError("Disposed", `${this.owner} is stopped`);
    }
  }

  private readService(name: ServiceName, receiver: Context): unknown {
    this.assertLive();
    const inject = this.scope.inject;
    if (
      !inject?.required?.includes(name) &&
      !inject?.optional?.includes(name)
    ) {
      throw new CoreError(
        "UndeclaredService",
        `${this.owner} did not inject ${name}`,
      );
    }
    const value = this.runtime.get(name);
    if (!isCallerBound(value)) {
      return value;
    }
    // Cached per provider value: a replaced provider gets a fresh facade.
    if (!this.facades.has(value)) {
      this.facades.set(value, value[bindCaller](receiver));
    }
    return this.facades.get(value);
  }
}
