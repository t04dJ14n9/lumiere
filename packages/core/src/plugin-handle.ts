import type { Context as CordisContext, Fiber } from "cordis";
import { Activation } from "./activation";
import type { Disposer } from "./activation";
import { ContextImpl } from "./context";
import { CoreError } from "./errors";
import { taggedLogger } from "./logger";
import type { Runtime, Settling } from "./runtime";
import type {
  Context,
  Plugin,
  PluginHandle,
  PluginState,
  ServiceName,
} from "./types";

/** Cordis's `FiberState`, which its declarations ship as a const enum. */
const enum CordisState {
  Pending = 0,
  Loading = 1,
  Active = 2,
  Failed = 3,
  Disposed = 4,
  Unloading = 5,
}

/**
 * One started plugin. Cordis runs it: the fiber starts once every injected
 * service is available, restarts when one is replaced, and stops after the
 * plugins that depend on its services. This class adds what Cordis does not:
 *
 * - Each start gets an `Activation` that owns its resources (see there).
 * - A start that a dependency change or a stop overtakes is abandoned at
 *   once instead of awaited, so an `apply` that never returns cannot block.
 * - Optional services: the fiber injects the optional services that exist
 *   when it starts, and is replaced when one appears or disappears.
 * - Children started during `apply` wait until it succeeds.
 */
export class PluginHandleImpl<C> implements PluginHandle<C>, Settling {
  config: C;
  error: unknown;
  context: Context | undefined;
  /** Set by the owner: forgets this plugin once it is disposed. */
  detach?: Disposer;
  private fiber?: Fiber;
  private activation?: Activation;
  /** Service values the current activation started with. */
  private dependencies = new Map<ServiceName, unknown>();
  private presentOptional: readonly ServiceName[] = [];
  private isStarted = false;
  private isDisposed = false;
  private disposing?: Promise<void>;
  private replacing: Promise<void> = Promise.resolve();
  private isReplacementQueued = false;
  private stopWatching?: () => void;

  constructor(
    private readonly runtime: Runtime,
    readonly definition: Plugin<C>,
    config: C,
  ) {
    this.config = config;
  }

  get state(): PluginState {
    if (this.isDisposed) {
      return "disposed";
    }
    switch (this.fiber?.state as CordisState | undefined) {
      case CordisState.Loading:
        return "loading";
      case CordisState.Active:
        return "active";
      case CordisState.Failed:
        return "failed";
      default:
        return "pending";
    }
  }

  get waitingFor(): readonly ServiceName[] {
    return this.required.filter((name) => !this.runtime.has(name));
  }

  get isBusy(): boolean {
    return this.isReplacementQueued || this.fiber?.inertia !== undefined;
  }

  idle(): Promise<unknown> {
    return Promise.allSettled([this.replacing, this.fiber?.await()]);
  }

  /** Begin running; a child calls this once its owner has committed. */
  start(): void {
    if (this.isStarted || this.isDisposed) {
      return;
    }
    this.isStarted = true;
    this.runtime.started.add(this);
    const names = [...this.required, ...this.optional];
    if (names.length) {
      this.stopWatching = this.runtime.watch(names, (name) =>
        this.serviceChanged(name as ServiceName),
      );
    }
    this.plug();
  }

  async update(config: C): Promise<void> {
    if (this.isDisposed) {
      throw new CoreError("Disposed", this.definition.name);
    }
    const parsed = this.definition.config?.parse(config) ?? config;
    if (this.reconfigureInPlace(parsed)) {
      this.config = parsed;
      return;
    }
    this.config = parsed;
    this.error = undefined;
    if (this.fiber) {
      this.activation?.cancel();
      // Cordis's update clears a failure and restarts with a new revision.
      // The outcome is reported through `state`, not by rejecting.
      await Promise.resolve(this.fiber.update(parsed, true)).catch(() => {});
    }
  }

  dispose(): Promise<void> {
    if (!this.disposing) {
      // Assigned before stopping: detaching from the owner re-enters here.
      let adopt!: (work: Promise<void>) => void;
      this.disposing = new Promise<void>((resolve) => (adopt = resolve));
      adopt(this.stop());
    }
    return this.disposing;
  }

  private get required(): readonly ServiceName[] {
    return this.definition.inject?.required ?? [];
  }

  private get optional(): readonly ServiceName[] {
    return this.definition.inject?.optional ?? [];
  }

  private reconfigureInPlace(config: C): boolean {
    const { reconfigure } = this.definition;
    if (this.state !== "active" || !this.context || !reconfigure) {
      return false;
    }
    try {
      return reconfigure(this.context, config);
    } catch (error) {
      this.context.logger.error("Reconfigure failed; restarting", error);
      return false;
    }
  }

  private async stop(): Promise<void> {
    this.isDisposed = true;
    this.stopWatching?.();
    this.activation?.cancel();
    // Synchronously, before any await: Cordis may otherwise begin an `apply`
    // it has already scheduled, with an activation nothing would cancel.
    const fiberStopped = this.fiber?.dispose();
    // Not awaited: the owner's release of this plugin joins this stop.
    void this.detach?.();
    await fiberStopped;
    // A replacement in progress sees `isDisposed` and plugs nothing new.
    await this.replacing;
    await this.fiber?.dispose();
    this.context = undefined;
    this.runtime.started.delete(this);
  }

  private plug(): void {
    this.presentOptional = this.optional.filter((name) =>
      this.runtime.has(name),
    );
    const plugged = this.runtime.cordis.plugin({
      name: this.definition.name,
      inject: [...this.required, ...this.presentOptional],
      apply: (ctx: CordisContext) => this.activate(ctx),
    });
    // Cordis returns the fiber wrapped in a thenable; keep the fiber itself
    // so it is never mistaken for a promise.
    this.fiber = Object.getPrototypeOf(plugged) as Fiber;
  }

  private serviceChanged(name: ServiceName): void {
    if (this.isDisposed) {
      return;
    }
    const isStarting =
      (this.fiber?.state as CordisState | undefined) === CordisState.Loading;
    if (
      isStarting &&
      this.dependencies.has(name) &&
      this.runtime.get(name) !== this.dependencies.get(name)
    ) {
      // Cordis would wait for this start to finish before restarting.
      this.activation?.cancel();
    }
    const isPresent = this.runtime.has(name);
    if (
      this.optional.includes(name) &&
      isPresent !== this.presentOptional.includes(name)
    ) {
      this.replaceFiber();
    }
  }

  /** Re-plug with the optional services that exist now. */
  private replaceFiber(): void {
    if (this.isReplacementQueued) {
      return;
    }
    this.isReplacementQueued = true;
    this.replacing = this.replacing.then(async () => {
      this.isReplacementQueued = false;
      if (this.isDisposed) {
        return;
      }
      this.activation?.cancel();
      await this.fiber?.dispose();
      if (!this.isDisposed) {
        this.plug();
      }
    });
    this.runtime.track(this.replacing);
  }

  /** Cordis's `apply` for this plugin: one activation. */
  private async activate(cordis: CordisContext): Promise<void> {
    const activation = new Activation(
      this.definition.name,
      this.runtime.ledger,
      taggedLogger(this.runtime.logger, this.definition.name),
    );
    this.activation = activation;
    this.dependencies = new Map(
      [...this.required, ...this.presentOptional].map((name) => [
        name,
        this.runtime.get(name),
      ]),
    );
    const commits: (() => void)[] = [];
    let isCommitted = false;
    const context = new ContextImpl(this.runtime, activation, {
      owner: this.definition.name,
      ...(this.definition.inject && { inject: this.definition.inject }),
      provides: this.definition.provides ?? [],
      publish: (name, value) => cordis.provide(name, value) as Disposer,
      startChild: (child) =>
        isCommitted ? child.start() : commits.push(() => child.start()),
    }) as unknown as Context;
    this.context = context;
    const started = Date.now();
    cordis.effect(
      () => async () => {
        await activation.dispose();
        if (isCommitted) {
          context.logger.debug("Stopped", { ms: Date.now() - started });
        }
      },
      "resources",
    );
    const outcome = await this.runApply(context, activation);
    if (outcome.kind === "abandoned") {
      return;
    }
    if (outcome.kind === "failed") {
      await this.fail(outcome.error, activation);
    }
    isCommitted = true;
    for (const start of commits) {
      start();
    }
    context.logger.debug("Loaded", { ms: Date.now() - started });
  }

  private async runApply(
    context: Context,
    activation: Activation,
  ): Promise<
    | { kind: "applied" }
    | { kind: "abandoned" }
    | { kind: "failed"; error: unknown }
  > {
    const work = (async () => {
      const config = this.definition.config?.parse(this.config) ?? this.config;
      this.config = config;
      await this.definition.apply(context, config);
    })();
    // `settled()` waits for every apply, abandoned ones included: their late
    // acquisitions are still being undone. Stopping never waits for it.
    this.runtime.track(work);
    const outcome = await Promise.race([
      work.then(
        () => ({ kind: "applied" as const }),
        (error: unknown) => ({ kind: "failed" as const, error }),
      ),
      activation.cancelled.then(() => ({ kind: "abandoned" as const })),
    ]);
    if (outcome.kind === "abandoned" || !activation.isLive) {
      // Whatever the abandoned `apply` acquires from now on is refused and
      // undone; its eventual failure is expected and only worth a debug line.
      work.catch((error: unknown) =>
        context.logger.debug("Abandoned start ended", error),
      );
      return { kind: "abandoned" };
    }
    return outcome;
  }

  /** Roll back, record the failure and let Cordis mark the fiber failed. */
  private async fail(cause: unknown, activation: Activation): Promise<never> {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const error = new CoreError(
      "PluginFailed",
      `${this.definition.name}: ${reason}`,
      { cause },
    );
    this.error = error;
    this.runtime.logger.error(`[${this.definition.name}] Plugin failed`, cause);
    for (const reported of [error, cause]) {
      if (typeof reported === "object" && reported !== null) {
        this.runtime.reported.add(reported);
      }
    }
    await activation.dispose();
    this.context = undefined;
    throw error;
  }
}
