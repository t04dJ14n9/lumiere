import { Context } from "./context";
import type { Runtime } from "./runtime";
import { KernelError } from "./errors";
import type { Plugin, Services } from "./types";
export type FiberState =
  | "pending"
  | "loading"
  | "active"
  | "failed"
  | "disposed";
/**
 * One started plugin, gated on its required services. Invariants: only the
 * current generation commits (a stale apply's context is already disposed),
 * and a fiber started by an uncommitted parent is held until that commit.
 */
export class Fiber<C = unknown> {
  state: FiberState = "pending";
  waitingFor: readonly (keyof Services)[] = [];
  error?: unknown;
  config: C;
  context?: Context;
  // An async apply can outlive disposal or dependency replacement. Only the
  // current generation may publish services or report its failure as current.
  private generation = 0;
  private stopping?: Promise<void>;
  private dependencies: unknown[] = [];
  private held: boolean;
  constructor(
    readonly runtime: Runtime,
    readonly definition: Plugin<C>,
    config: C,
    options: { heldUntilCommit?: boolean } = {},
  ) {
    this.config = config;
    this.held = options.heldUntilCommit ?? false;
    runtime.fibers.add(this as Fiber<unknown>);
  }
  /** The parent committed: a held fiber may start now. */
  startAfterCommit(): void {
    if (this.held) {
      this.held = false;
      this.reconcile();
    }
  }
  /** Start, stop or restart to match the services; returns a stop it began. */
  reconcile(): Promise<void> | undefined {
    const done = this.state === "disposed" || this.state === "failed";
    if (this.held || this.stopping || done) {
      return undefined;
    }
    const required = this.definition.inject?.required ?? [];
    this.waitingFor = required.filter(
      (name) => this.runtime.value(name) === undefined,
    );
    const values = [
      ...required,
      ...(this.definition.inject?.optional ?? []),
    ].map((name) => this.runtime.value(name));
    if (
      this.context &&
      (this.waitingFor.length ||
        values.some((v, i) => v !== this.dependencies[i]))
    ) {
      const stopped = this.stop();
      this.runtime.track(stopped.then(() => this.reconcile()));
      return stopped;
    }
    if (this.waitingFor.length || this.context) {
      return undefined;
    }
    this.dependencies = values;
    this.start();
    return undefined;
  }
  private start(): void {
    const generation = ++this.generation;
    this.state = "loading";
    this.error = undefined;
    const ctx = (this.context = new Context(
      this.runtime,
      this as Fiber<unknown>,
    ));
    const started = Date.now();
    this.runtime.track(
      (async () => {
        try {
          if (this.definition.config) {
            this.config = this.definition.config.parse(this.config);
          }
          await this.definition.apply(ctx, this.config);
          if (this.generation !== generation) {
            return;
          }
          this.state = "active";
          ctx.publish();
          ctx.logger.debug("Loaded", { ms: Date.now() - started });
        } catch (error) {
          if (this.generation !== generation) {
            return;
          }
          this.state = "failed";
          this.error = new KernelError("PluginFailed", this.definition.name, {
            cause: error,
          });
          ctx.logger.error("Plugin failed", error);
          await ctx.dispose();
          this.context = undefined;
        }
      })(),
    );
  }
  private stop(): Promise<void> {
    if (this.stopping) {
      return this.stopping;
    }
    // Invalidate outstanding apply work before awaiting its effect cleanup.
    ++this.generation;
    const ctx = this.context;
    this.context = undefined;
    if (this.state !== "disposed") {
      this.state = "pending";
    }
    const started = Date.now();
    this.stopping = Promise.resolve()
      .then(() => ctx?.dispose())
      .then(() => {
        ctx?.logger.debug("Stopped", { ms: Date.now() - started });
        this.stopping = undefined;
      });
    return this.stopping;
  }
  async update(config: C): Promise<void> {
    if (this.state === "disposed") {
      throw new KernelError("Disposed", this.definition.name);
    }
    const parsed = this.definition.config
      ? this.definition.config.parse(config)
      : config;
    try {
      if (
        this.state === "active" &&
        this.context &&
        this.definition.reconfigure?.(this.context, parsed)
      ) {
        this.config = parsed;
        return;
      }
    } catch (error) {
      this.context?.logger.error("Reconfigure failed; restarting", error);
    }
    await this.stop();
    this.config = parsed;
    this.error = undefined;
    this.reconcile();
  }
  async dispose(): Promise<void> {
    if (this.state === "disposed") {
      await this.stopping;
      return;
    }
    this.state = "disposed";
    this.runtime.fibers.delete(this as Fiber<unknown>);
    await this.stop();
  }
}
