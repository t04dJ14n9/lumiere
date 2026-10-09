import { KernelError } from "./errors";
import { Fiber } from "./fiber";
import { silentLogger, taggedLogger } from "./logger";
import type { Logger } from "./logger";
import { Runtime } from "./runtime";
import { asPlugin, bindCaller } from "./services";
import type { CallerBound, ServiceClass } from "./services";
import type {
  Disposer,
  EventFunction,
  Events,
  Plugin,
  Resource,
  Services,
} from "./types";
export { Runtime } from "./runtime";

/** One thing a context holds: a resource or (with `fiber`) a child plugin. */
type Held = { release: () => Promise<void>; fiber?: Fiber<unknown> };

/**
 * A plugin's view of the kernel. Invariants (kernel/README.md, "Lifecycle"):
 * activation is a transaction (services publish and held children start on
 * commit; a failed apply releases everything); teardown mirrors it (withdraw
 * services and await the consumers that stop, then release LIFO); a disposed
 * context refuses late work.
 */
// Declaration merging exposes typed injected services as properties.
// The Proxy below implements each property from the open Services contract.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- typed service properties (DESIGN §5.2)
export interface Context extends Services {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the class half of the merge above
export class Context {
  readonly logger: Logger;
  /** Everything held, in acquisition order; released in reverse. */
  private readonly held: Held[] = [];
  private readonly offered = new Map<keyof Services, unknown>();
  private readonly bound = new Map<unknown, unknown>();
  private live = true;
  private published = false;
  constructor(
    readonly runtime = new Runtime(silentLogger, new Set()),
    readonly fiber?: Fiber<unknown>,
  ) {
    this.logger = taggedLogger(runtime.logger, this.owner);
    return new Proxy(this, {
      get: (target, key, receiver) => {
        // Promise resolution probes this property on returned contexts.
        if (key === "then") {
          return undefined;
        }
        if (Reflect.has(target, key) || typeof key !== "string") {
          return Reflect.get(target, key, receiver);
        }
        return target.readService(key, receiver);
      },
    });
  }
  /** The plugin this context belongs to, as the ledger and logs name it. */
  get owner(): string {
    return this.fiber?.definition.name ?? "root";
  }
  /** Child plugins still held, oldest first. */
  get children(): readonly Fiber<unknown>[] {
    return this.held.flatMap((item) => (item.fiber ? [item.fiber] : []));
  }
  // Service reads need the actual consumer proxy for delegated ownership; cache
  // by provider identity so replacement never reuses the previous provider's facade.
  private readService(key: string, receiver: Context): unknown {
    this.assertLive();
    const name = key as keyof Services;
    if (
      !this.fiber?.definition.inject?.required?.includes(name) &&
      !this.fiber?.definition.inject?.optional?.includes(name)
    ) {
      throw new KernelError(
        "UndeclaredService",
        `${this.owner} did not inject ${key}`,
      );
    }
    const value = this.runtime.value(name);
    if (isCallerBound(value)) {
      if (!this.bound.has(value)) {
        this.bound.set(value, value[bindCaller](receiver));
      }
      return this.bound.get(value);
    }
    return value;
  }
  static create(
    options: {
      logger?: Logger;
      replaceable?: readonly (keyof Services)[];
      rank?: (owner: string) => number;
    } = {},
  ): Context {
    const { logger = silentLogger, replaceable, rank } = options;
    return new Context(new Runtime(logger, new Set(replaceable), rank));
  }
  assertLive(): void {
    if (!this.live) {
      throw new KernelError("Disposed", "Context is disposed");
    }
  }
  plugin<C>(definition: Plugin<C>, config?: C): Fiber<C>;
  plugin<C>(definition: ServiceClass<C>, config?: C): Fiber<C>;
  plugin<C>(definition: Plugin<C> | ServiceClass<C>, config?: C): Fiber<C> {
    this.assertLive();
    const fiber = new Fiber(this.runtime, asPlugin(definition), config as C, {
      // Started by a plugin that has not committed: wait for the commit.
      heldUntilCommit: Boolean(this.fiber) && !this.published,
    });
    // A child disposed on its own (a feature turned off) leaves the list.
    fiber.detach = this.hold("fiber", () => fiber.dispose(), fiber);
    void fiber.reconcile();
    return fiber;
  }
  provide<K extends keyof Services>(name: K, value: Services[K]): void {
    this.assertLive();
    if (value === undefined) {
      throw new KernelError("DuplicateService", "Services cannot be undefined");
    }
    if (this.offered.has(name)) {
      throw new KernelError("DuplicateService", String(name));
    }
    this.offered.set(name, value);
    if (!this.fiber || this.published) {
      this.publish();
    }
  }
  /** Commit: publish the offered services, then start the held children. */
  publish(): void {
    this.assertLive();
    for (const name of this.offered.keys()) {
      const stack = this.runtime.providers.get(name) ?? [];
      if (
        stack.some((p) => p.ctx !== this) &&
        !this.runtime.replaceable.has(name)
      ) {
        throw new KernelError("DuplicateService", String(name));
      }
    }
    for (const [name, value] of this.offered) {
      const stack = this.runtime.providers.get(name) ?? [];
      if (!stack.some((p) => p.ctx === this)) {
        stack.push({ ctx: this, value });
        this.runtime.ledger.add(this.owner, "service");
      }
      this.runtime.providers.set(name, stack);
    }
    this.published = true;
    for (const child of this.children) {
      child.startAfterCommit();
    }
    void this.runtime.changed();
  }
  /** Run `setup` now and undo it when this context stops. */
  effect(setup: () => Disposer | Resource, kind: string = "effect"): Disposer {
    this.assertLive();
    return this.acquire(kind, setup());
  }
  /** Hold a resource until this context stops (`kind` names it in the ledger). */
  acquire(kind: string, resource: Disposer | Resource): Disposer {
    const undo = () =>
      typeof resource === "function" ? resource() : resource.dispose();
    if (!this.live) {
      void undo();
      throw new KernelError("Disposed", `${this.owner} acquired a ${kind}`);
    }
    return this.hold(kind, undo);
  }
  private hold(kind: string, undo: () => unknown, fiber?: Fiber<unknown>) {
    const entry: Held = { release: async () => {}, fiber };
    entry.release = async () => {
      // Released once, early or at dispose; either way it leaves the list.
      const index = this.held.indexOf(entry);
      if (index >= 0) {
        this.held.splice(index, 1);
        this.runtime.ledger.remove(this.owner, kind);
        await undo();
      }
    };
    this.held.push(entry);
    this.runtime.ledger.add(this.owner, kind);
    return entry.release;
  }
  on<K extends keyof Events>(
    name: K,
    listener: EventFunction<K>,
    options?: { prepend?: boolean },
  ): Disposer {
    return this.effect(
      () =>
        this.runtime.events.on(name, listener, {
          logger: this.logger,
          prepend: options?.prepend,
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
    this.runtime.events.emit(name, args);
  }
  serial<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void> {
    this.assertLive();
    return this.runtime.events.serial(name, args);
  }
  parallel<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): Promise<void> {
    this.assertLive();
    return this.runtime.events.parallel(name, args);
  }
  bail<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): ReturnType<EventFunction<K>> | undefined {
    this.assertLive();
    return this.runtime.events.bail(name, args) as
      | ReturnType<EventFunction<K>>
      | undefined;
  }
  waterfall<K extends keyof Events>(
    name: K,
    value: Parameters<EventFunction<K>>[0],
  ): Promise<Parameters<EventFunction<K>>[0]> {
    this.assertLive();
    return this.runtime.events.waterfall(name, value) as Promise<
      Parameters<EventFunction<K>>[0]
    >;
  }
  settled(): Promise<void> {
    return this.runtime.settled();
  }
  async dispose(): Promise<void> {
    if (!this.live) {
      return;
    }
    this.live = false;
    await this.withdrawServices();
    for (const item of this.held.slice().reverse()) {
      await item.release().catch((error: unknown) => {
        this.logger.error("Effect disposal failed", error);
      });
    }
    this.bound.clear();
  }
  // Consumers stop (and finish stopping) while the resources backing these
  // services still exist; only then are the resources released.
  private async withdrawServices(): Promise<void> {
    let withdrawn = false;
    for (const name of this.offered.keys()) {
      const stack = this.runtime.providers.get(name) ?? [];
      if (stack.some((p) => p.ctx === this)) {
        this.runtime.providers.set(
          name,
          stack.filter((p) => p.ctx !== this),
        );
        this.runtime.ledger.remove(this.owner, "service");
        withdrawn = true;
      }
    }
    if (withdrawn) {
      await this.runtime.changed();
    }
  }
}

function isCallerBound(value: unknown): value is CallerBound {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    bindCaller in value &&
    typeof value[bindCaller] === "function"
  );
}
