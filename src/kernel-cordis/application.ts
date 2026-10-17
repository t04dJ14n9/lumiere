import { Context } from "cordis";
import type { Fiber, Plugin } from "cordis";
import { Lifetime } from "./lifetime";
import type { Release } from "./lifetime";

export interface CordisScope<S> {
  acquire(inverse: Release): Release;
  provide<K extends keyof S & string>(name: K, value: S[K]): void;
  get<K extends keyof S & string>(name: K): S[K];
}

/** Static ownership graph; required providers declare their service names. */
export interface CordisDefinition<S> {
  readonly id: string;
  readonly requires?: readonly string[];
  readonly provides?: readonly (keyof S & string)[];
  apply(scope: CordisScope<S>): void | Promise<void>;
}

export type CordisState =
  "inactive" | "starting" | "active" | "stopping" | "failed" | "blocked";

interface Entry {
  fiber: Fiber;
  lifetime?: Lifetime;
  /** Application completion, deliberately distinct from cancelled Cordis apply. */
  finished?: Promise<void>;
}

interface ApplySession<S> {
  definition: CordisDefinition<S>;
  ctx: Context;
  lifetime: Lifetime;
  offered: Map<keyof S & string, S[keyof S & string]>;
  onFailure: (error: unknown) => void;
}

/**
 * App-owned CHILD lifetime over unmodified cordis@4.0.0-rc.10 public APIs.
 * Cordis owns registry/DI/fiber transitions. The app owns cancellation,
 * resource completion, and barriers before provider fiber disposal. This is
 * an opt-in building block; the host still constructs the native kernel.
 */
export class CordisApplication<S> {
  private readonly app: Fiber;
  private readonly definitions: ReadonlyMap<string, CordisDefinition<S>>;
  private readonly plugins = new Map<string, Plugin.Object>();
  private readonly entries = new Map<string, Entry>();
  /** Includes already-stopping consumers until their last inverse settles. */
  private readonly stopping = new Map<string, Promise<void>>();
  private readonly detachLogger: () => void | Promise<void>;
  private shutdown: Promise<void> | undefined;
  private closed = false;

  constructor(
    definitions: readonly CordisDefinition<S>[],
    private readonly report: (error: unknown) => void,
    private readonly root = new Context(),
  ) {
    this.definitions = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    if (this.definitions.size !== definitions.length) {
      throw new Error("duplicate plugin id");
    }
    const services = definitions.flatMap(
      (definition) => definition.provides ?? [],
    );
    if (new Set(services).size !== services.length) {
      throw new Error("duplicate service owner");
    }
    for (const definition of definitions) {
      this.validate(definition.id);
    }
    this.detachLogger = this.root.logger.exporter({
      export: (message) => {
        if (message.type === "error") {
          for (const error of message.args as unknown[]) {
            this.report(error);
          }
        }
      },
    });
    this.app = this.root.plugin({ name: "application-lifetime", apply() {} });
    for (const definition of definitions) {
      const inject = (definition.requires ?? []).flatMap(
        (id) => this.definition(id).provides ?? [],
      );
      this.plugins.set(definition.id, {
        name: definition.id,
        inject,
        apply: (ctx: Context) => this.apply(definition, ctx),
      });
    }
  }

  async enable(id: string): Promise<void> {
    this.definition(id);
    if (this.closed) {
      throw new Error("application lifetime has been disposed");
    }
    // Wait for provider withdrawal too, so no new consumer starts against
    // backing that a concurrent stop has already committed to releasing.
    while (true) {
      const barriers = [...this.stopping].filter(
        ([other]) => other === id || this.dependsOn(id, other),
      );
      if (!barriers.length) {
        break;
      }
      await Promise.all(barriers.map(([, stop]) => stop));
    }
    if (this.closed) {
      throw new Error("application lifetime has been disposed");
    }
    let entry = this.entries.get(id);
    if (!entry || entry.fiber.uid === null) {
      const plugin = this.plugins.get(id)!;
      entry = { fiber: this.app.ctx.plugin(plugin) };
      this.entries.set(id, entry);
    }
    try {
      await entry.fiber.await();
    } catch {
      // Cordis reports activation failures to the logger; callers settle.
    }
    // Stop can finish while an uncooperative initializer is still running.
    // Its original enable caller continues to observe that initializer.
    await entry.finished;
  }

  disable(id: string): Promise<void> {
    this.definition(id);
    const pending = this.stopping.get(id);
    if (pending) {
      return pending;
    }
    // Install the barrier before invoking any plugin cleanup or recursion.
    const stop = Promise.resolve()
      .then(async () => {
        for (const other of [...this.entries.keys()].reverse()) {
          if (other !== id && this.dependsOn(other, id)) {
            await this.disable(other);
          }
        }
        const entry = this.entries.get(id);
        if (!entry) {
          return;
        }
        entry.lifetime?.cancel();
        await entry.fiber.dispose();
        await entry.lifetime?.dispose();
      })
      .finally(() => {
        this.stopping.delete(id);
      });
    this.stopping.set(id, stop);
    return stop;
  }

  async restart(id: string): Promise<void> {
    await this.disable(id);
    await this.enable(id);
  }

  /** Permanent app close: never call root.fiber.dispose() (that restarts). */
  dispose(): Promise<void> {
    this.closed = true;
    this.shutdown ??= Promise.resolve().then(async () => {
      for (const id of [...this.entries.keys()].reverse()) {
        await this.disable(id);
      }
      await Promise.all(this.stopping.values());
      await this.app.dispose();
      await this.detachLogger();
    });
    return this.shutdown;
  }

  state(id: string): CordisState {
    if (this.stopping.has(id)) {
      return "stopping";
    }
    const fiber = this.entries.get(id)?.fiber;
    if (!fiber || fiber.uid === null) {
      return "inactive";
    }
    // FiberState is a const enum in Cordis's declarations (isolatedModules).
    switch (fiber.state as number) {
      case 1:
        return "starting";
      case 2:
        return "active";
      case 3:
        return "failed";
      case 5:
        return "stopping";
      default:
        return "blocked";
    }
  }

  find<K extends keyof S & string>(name: K): S[K] | undefined {
    return this.root.get(name) as S[K] | undefined;
  }

  private async apply(
    definition: CordisDefinition<S>,
    ctx: Context,
  ): Promise<void> {
    const entry = this.entries.get(definition.id);
    if (
      !entry ||
      entry.fiber.uid !== ctx.fiber.uid ||
      this.closed ||
      this.stopping.has(definition.id)
    ) {
      return;
    }
    const lifetime = new Lifetime(this.report);
    entry.lifetime = lifetime;
    // One effect owns the whole resource stack; Cordis's concurrent top-level
    // unload cannot reorder resources or skip older inverses after a failure.
    ctx.effect(() => () => lifetime.dispose(), "application resource stack");
    const offered = new Map<keyof S & string, S[keyof S & string]>();
    let failure: { error: unknown } | undefined;
    const session: ApplySession<S> = {
      definition,
      ctx,
      lifetime,
      offered,
      onFailure: (error) => {
        failure = { error };
      },
    };
    // Always observed, even after cancellation wins the race. Stale apply
    // cannot publish, and its refused acquisitions use Lifetime's late drain.
    const work = this.runApply(session);
    entry.finished = work;
    await Promise.race([work, lifetime.cancelled]);
    if (!lifetime.isLive) {
      await lifetime.dispose();
    }
    if (failure) {
      throw failure.error;
    }
  }

  private scope(session: ApplySession<S>): CordisScope<S> {
    const { definition, ctx, lifetime, offered } = session;
    return {
      acquire: (inverse) => lifetime.acquire(inverse),
      provide: (name, value) => {
        if (!lifetime.isLive) {
          throw new Error("cannot provide on a stopped lifetime");
        }
        if (!definition.provides?.includes(name)) {
          throw new Error(`${name} is not declared by ${definition.id}`);
        }
        if (offered.has(name)) {
          throw new Error(`${name} provided twice`);
        }
        offered.set(name, value);
      },
      get: (name) => {
        const value = ctx.get(name) as S[typeof name] | undefined;
        if (value === undefined) {
          throw new Error(`missing service ${name}`);
        }
        return value;
      },
    };
  }

  private async runApply(session: ApplySession<S>): Promise<void> {
    const { definition, ctx, lifetime, offered, onFailure } = session;
    const scope = this.scope(session);
    try {
      await definition.apply(scope);
      if (lifetime.isLive) {
        for (const [name, value] of offered) {
          ctx.provide(name, value);
        }
      } else {
        await lifetime.dispose();
      }
    } catch (error) {
      if (lifetime.isLive) {
        onFailure(error);
      }
      await lifetime.dispose();
    }
  }

  private definition(id: string): CordisDefinition<S> {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`No plugin ${id}`);
    }
    return definition;
  }

  private validate(id: string, path: readonly string[] = []): void {
    if (path.includes(id)) {
      throw new Error(`plugin dependency cycle: ${[...path, id].join(" -> ")}`);
    }
    for (const required of this.definition(id).requires ?? []) {
      if (!this.definition(required).provides?.length) {
        throw new Error(`${required} must declare its provided services`);
      }
      this.validate(required, [...path, id]);
    }
  }

  private dependsOn(id: string, target: string): boolean {
    return (this.definition(id).requires ?? []).some(
      (required) => required === target || this.dependsOn(required, target),
    );
  }
}
