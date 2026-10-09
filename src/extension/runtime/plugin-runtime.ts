/**
 * The extension's plugin runtime: activates plugins in dependency order, each
 * in a transaction, and tears them down in the reverse order.
 *
 * It imports nothing from VS Code, so unit tests drive it directly.
 *
 * Invariants (each has a test in test/unit/plugin-runtime.test.ts):
 *
 * - A plugin's resources are rollback-owned until it commits. If its
 *   `activate` throws, every resource it acquired is released (last
 *   acquired first), its services are never published, and the plugins that
 *   require it do not start.
 * - Services become visible to other plugins only on commit, so no plugin
 *   ever sees a half-initialised service.
 * - A plugin commits only if, when its `activate` returns, it was not
 *   disabled meanwhile, the runtime was not disposed, and every plugin it
 *   requires is still the same active instance it started against.
 * - `disable` and `dispose` cancel a plugin that is still starting: what it
 *   has acquired is released before they resolve, and anything it acquires
 *   later is released at once (`acquire` throws). They do not wait for its
 *   `activate` to return, which may never happen.
 * - Concurrent `enable` calls for one plugin join one activation.
 * - Teardown is the mirror of activation: dependants stop (and finish
 *   stopping) before what they depend on; within a plugin, its services are
 *   withdrawn first and its resources are released last acquired first.
 *   When `disable` or `dispose` resolves, every release has completed.
 * - A scope is released once: a failed activation's rollback, `disable` and
 *   `dispose` all join the same release, so none resolves while another's
 *   inverses still run. Its errors are logged once, by whoever started it.
 * - A plugin's activation order comes from the dependency graph
 *   (`requires`, and `optional` when present), never from where it sits in
 *   the catalog; the catalog order only breaks ties.
 */
import type { PluginManifest } from './manifest';

/** Anything a plugin holds that must be undone: a registration, a server, a timer. */
export interface Resource {
  /** Awaited: a returned promise is part of teardown. */
  dispose(): unknown;
}

export type PluginState = 'inactive' | 'starting' | 'active' | 'stopping' | 'failed' | 'blocked';

export interface PluginDefinition<S> {
  readonly manifest: PluginManifest<keyof S & string>;
  activate(scope: PluginScope<S>): void | Promise<void>;
}

export interface RuntimeLog {
  info(message: string): void;
  error(message: string): void;
}

interface Held {
  kind: string;
  resource: Resource;
}

/** What one plugin's `activate` works with: its resources and services. */
export class PluginScope<S> {
  /** Resources in the order acquired; released in reverse. */
  readonly held: Held[] = [];
  readonly offered = new Map<keyof S, S[keyof S]>();
  private live = true;
  /** Releases of late resources still running; `release()` joins them. */
  private readonly releasing = new Set<Promise<unknown>>();
  /** The one release of `held`, shared by every caller (R3-3). */
  private releasingHeld?: Promise<unknown[]>;

  constructor(
    readonly id: string,
    private readonly lookup: <K extends keyof S>(name: K) => S[K] | undefined,
  ) {}

  get isLive(): boolean {
    return this.live;
  }

  /**
   * Hold a resource for the plugin's lifetime. `kind` names it in leak
   * reports ("command", "server", "watcher"). A resource acquired after the
   * plugin stopped or was cancelled (a late async callback, an activation
   * still running) is released at once, and `acquire` throws.
   */
  acquire<T extends Resource>(resource: T, kind = 'resource'): T {
    if (!this.live) {
      let result: unknown;
      try {
        result = resource.dispose();
      } catch {
        // Nothing to report to: the plugin has stopped.
      }
      const late = Promise.resolve(result).catch(() => undefined);
      this.releasing.add(late);
      void late.then(() => this.releasing.delete(late));
      throw new Error(`${this.id} acquired a ${kind} after it stopped`);
    }
    this.held.push({ kind, resource });
    return resource;
  }

  /** Offer a service; other plugins see it only once this plugin commits. */
  provide<K extends keyof S>(name: K, value: S[K]): void {
    if (this.offered.has(name)) throw new Error(`${this.id} provides ${String(name)} twice`);
    this.offered.set(name, value);
  }

  /** A service this plugin requires; its provider is active by construction. */
  get<K extends keyof S>(name: K): S[K] {
    const value = this.lookup(name);
    if (value === undefined) throw new Error(`${this.id} needs the ${String(name)} service, which nothing provides`);
    return value;
  }

  /** A service from an optional plugin, if that plugin is active. */
  find<K extends keyof S>(name: K): S[K] | undefined {
    return this.lookup(name);
  }

  /** Whether `release()` has been called (by anyone). */
  get released(): boolean {
    return this.releasingHeld !== undefined;
  }

  /**
   * Release everything, last acquired first, and wait for each release.
   * Errors are collected, not thrown. Every caller joins the same release
   * (a rollback and a disposal overlapping wait for the same inverses and
   * get the same errors), and also waits for late resources released since.
   */
  async release(): Promise<unknown[]> {
    this.live = false;
    this.releasingHeld ??= (async () => {
      const errors: unknown[] = [];
      for (const { resource } of this.held.splice(0).reverse()) {
        try {
          await resource.dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      return errors;
    })();
    const errors = await this.releasingHeld;
    await Promise.all([...this.releasing]);
    return errors;
  }
}

interface Starting<S> {
  scope: PluginScope<S>;
  /** Settles when `activate` has returned and the plugin committed or rolled back. */
  done?: Promise<void>;
}

export class PluginRuntime<S> {
  private readonly definitions: readonly PluginDefinition<S>[];
  private readonly states = new Map<string, PluginState>();
  /** Committed plugins. */
  private readonly scopes = new Map<string, PluginScope<S>>();
  /** Plugins whose `activate` is running. */
  private readonly starting = new Map<string, Starting<S>>();
  /** Plugins being torn down, so a second caller waits for the same teardown. */
  private readonly stopping = new Map<string, Promise<void>>();
  /** Published services: the root's, then each committed plugin's. */
  private readonly services = new Map<keyof S, { owner: string; value: S[keyof S] }>();
  /** Ids in the order they committed; teardown walks it backwards. */
  private readonly activationOrder: string[] = [];
  private disposed = false;

  constructor(
    definitions: readonly PluginDefinition<S>[],
    private readonly log: RuntimeLog,
    root: Partial<S> = {},
  ) {
    this.definitions = activationOrder(definitions);
    for (const definition of this.definitions) this.states.set(definition.manifest.id, 'inactive');
    for (const [name, value] of Object.entries(root) as [keyof S, S[keyof S]][]) {
      this.services.set(name, { owner: 'root', value });
    }
  }

  /** The plugins in activation order. */
  get plugins(): readonly PluginManifest<keyof S & string>[] {
    return this.definitions.map(definition => definition.manifest);
  }

  state(id: string): PluginState | undefined {
    return this.states.get(id);
  }

  /** What each committed or starting plugin holds, by kind: the basis of the leak tests. */
  resources(): Record<string, string[]> {
    const scopes = [...this.scopes, ...[...this.starting].map(([id, { scope }]) => [id, scope] as const)];
    return Object.fromEntries(scopes.map(([id, scope]) => [id, scope.held.map(held => held.kind)]));
  }

  /** Activate every plugin (or only `only`) whose requirements are met. */
  async start(only?: (id: string) => boolean): Promise<void> {
    for (const definition of this.definitions) {
      if (only && !only(definition.manifest.id)) continue;
      await this.activate(definition);
    }
  }

  /**
   * Activate one plugin (its requirements must be active). Returns whether
   * it committed. A second call while it starts joins the first.
   */
  async enable(id: string): Promise<boolean> {
    await this.activate(this.definition(id));
    return this.states.get(id) === 'active';
  }

  /**
   * Stop a plugin, and first every plugin that depends on it, whether active
   * or still starting. Resolves once all of their resources are released.
   */
  async disable(id: string): Promise<void> {
    const dependants = this.definitions.map(definition => definition.manifest.id)
      .filter(other => other !== id && this.dependsOn(other, id)).reverse();
    for (const dependant of dependants) await this.deactivate(dependant);
    await this.deactivate(id);
  }

  /** Stop everything, last activated (or starting) first; resolves when all is released. */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const id of [...this.starting.keys()].reverse()) await this.deactivate(id);
    for (const id of [...this.activationOrder].reverse()) await this.deactivate(id);
    await Promise.all(this.stopping.values());
  }

  private async activate(definition: PluginDefinition<S>): Promise<void> {
    const { id, requires } = definition.manifest;
    const pending = this.starting.get(id);
    if (pending) return pending.done;
    await this.stopping.get(id);
    if (this.starting.has(id)) return this.starting.get(id)?.done;
    if (this.disposed || this.states.get(id) === 'active') return;
    const missing = requires.filter(required => this.states.get(required) !== 'active');
    if (missing.length) {
      this.states.set(id, 'blocked');
      this.log.info(`${id} not started: needs ${missing.join(', ')}`);
      return;
    }
    // The provider instances this activation is built on.
    const providers = new Map(requires.map(required => [required, this.scopes.get(required)]));
    const scope = new PluginScope<S>(id, <K extends keyof S>(name: K) => this.services.get(name)?.value as S[K] | undefined);
    const entry: Starting<S> = { scope };
    this.starting.set(id, entry);
    this.states.set(id, 'starting');
    entry.done = (async () => {
      try {
        await definition.activate(scope);
        if (this.disposed) throw new Error('the extension stopped while it was starting');
        if (!scope.isLive) throw new Error('it was stopped while it was starting');
        const lost = requires.filter(required => this.scopes.get(required) !== providers.get(required));
        if (lost.length) throw new Error(`${lost.join(', ')} stopped while it was starting`);
        this.commit(scope);
      } catch (error) {
        await this.rollback(scope, error);
      } finally {
        if (this.starting.get(id)?.scope === scope) this.starting.delete(id);
      }
    })();
    return entry.done;
  }

  private commit(scope: PluginScope<S>): void {
    for (const [name] of scope.offered) {
      const existing = this.services.get(name);
      if (existing) throw new Error(`${String(name)} is already provided by ${existing.owner}`);
    }
    for (const [name, value] of scope.offered) this.services.set(name, { owner: scope.id, value });
    this.scopes.set(scope.id, scope);
    this.states.set(scope.id, 'active');
    this.activationOrder.push(scope.id);
  }

  private async rollback(scope: PluginScope<S>, error: unknown): Promise<void> {
    const cancelled = !scope.isLive;
    // A teardown that already started the release logs its errors.
    const joined = scope.released;
    const errors = await scope.release();
    const current = this.starting.get(scope.id)?.scope === scope;
    if (cancelled) {
      this.log.info(`${scope.id} was not started: ${describe(error)}`);
    } else {
      if (current) this.states.set(scope.id, 'failed');
      this.log.error(`${scope.id} failed to start and was rolled back: ${describe(error)}`);
    }
    if (!joined) for (const cleanup of errors) this.log.error(`${scope.id} rollback: ${describe(cleanup)}`);
  }

  /** Stop one plugin, committed or starting; joins a teardown already running. */
  private deactivate(id: string): Promise<void> {
    const running = this.stopping.get(id);
    if (running) return running;
    const scope = this.scopes.get(id) ?? this.starting.get(id)?.scope;
    if (!scope) return Promise.resolve();
    const teardown = (async () => {
      this.states.set(id, 'stopping');
      // Dependants already stopping (another caller started them) finish
      // first: they may still use this plugin's services while they stop.
      // A dependant never waits on its provider, so this cannot deadlock.
      await Promise.all([...this.stopping]
        .filter(([other]) => other !== id && this.dependsOn(other, id))
        .map(([, stopping]) => stopping));
      // Withdraw the services before releasing what backs them.
      for (const [name, entry] of [...this.services]) {
        if (entry.owner === id) this.services.delete(name);
      }
      if (this.scopes.get(id) === scope) {
        this.scopes.delete(id);
        this.activationOrder.splice(this.activationOrder.indexOf(id), 1);
      }
      // A cancelled activation is no longer joinable; a new enable starts afresh.
      if (this.starting.get(id)?.scope === scope) this.starting.delete(id);
      // A release already running (a failed activation rolling back) is
      // joined; its errors are logged by whoever started it.
      const joined = scope.released;
      const errors = await scope.release();
      if (!joined) for (const error of errors) this.log.error(`${id} teardown: ${describe(error)}`);
      this.states.set(id, 'inactive');
    })().finally(() => this.stopping.delete(id));
    this.stopping.set(id, teardown);
    return teardown;
  }

  private dependsOn(id: string, target: string, seen = new Set<string>()): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    const { requires, optional = [] } = this.definition(id).manifest;
    return [...requires, ...optional].some(next => next === target || this.dependsOn(next, target, seen));
  }

  private definition(id: string): PluginDefinition<S> {
    const definition = this.definitions.find(candidate => candidate.manifest.id === id);
    if (!definition) throw new Error(`No plugin ${id}`);
    return definition;
  }
}

/**
 * The plugins sorted so each comes after everything it requires or
 * optionally uses (a stable topological sort: catalog order breaks ties).
 * Unknown requirements and cycles are programming errors and throw.
 */
export function activationOrder<D extends { manifest: PluginManifest }>(definitions: readonly D[]): D[] {
  const byId = new Map(definitions.map(definition => [definition.manifest.id, definition]));
  const sorted: D[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (definition: D, path: string[]): void => {
    const { id, requires, optional = [] } = definition.manifest;
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`Plugin dependency cycle: ${[...path, id].join(' -> ')}`);
    state.set(id, 'visiting');
    for (const required of requires) {
      const dependency = byId.get(required);
      if (!dependency) throw new Error(`${id} requires ${required}, which is not in the catalog`);
      visit(dependency, [...path, id]);
    }
    for (const wanted of optional) {
      const dependency = byId.get(wanted);
      if (dependency) visit(dependency, [...path, id]);
    }
    state.set(id, 'done');
    sorted.push(definition);
  };
  for (const definition of definitions) visit(definition, []);
  return sorted;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
