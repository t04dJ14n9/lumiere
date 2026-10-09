/**
 * The extension's plugin runtime: activates plugins in dependency order, each
 * in a transaction, and tears them down in the reverse order.
 *
 * It imports nothing from VS Code, so unit tests drive it directly.
 *
 * Invariants:
 *
 * - A plugin's resources are rollback-owned until its `activate` returns. If
 *   it throws, every resource it acquired is released (last acquired first),
 *   its services are never published, and the plugins that require it do not
 *   start. A failed activation leaves no trace.
 * - Services become visible to other plugins only on commit, so no plugin
 *   ever sees a half-initialised service.
 * - Teardown is the mirror of activation: dependants stop before what they
 *   depend on; within a plugin, its services are withdrawn first and its
 *   resources are released last acquired first.
 * - A plugin's activation order comes from the dependency graph
 *   (`requires`, and `optional` when present), never from where it sits in
 *   the catalog; the catalog order only breaks ties.
 */
import type { PluginManifest } from './manifest';

/** Anything a plugin holds that must be undone: a registration, a server, a timer. */
export interface Resource {
  dispose(): unknown;
}

export type PluginState = 'inactive' | 'active' | 'failed' | 'blocked';

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

  constructor(
    readonly id: string,
    private readonly lookup: <K extends keyof S>(name: K) => S[K] | undefined,
  ) {}

  /**
   * Hold a resource for the plugin's lifetime. `kind` names it in leak
   * reports ("command", "server", "watcher"). A resource acquired after the
   * plugin stopped (a late async callback) is released at once.
   */
  acquire<T extends Resource>(resource: T, kind = 'resource'): T {
    if (!this.live) {
      void resource.dispose();
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

  /** Release everything, last acquired first. Errors are collected, not thrown. */
  async release(): Promise<unknown[]> {
    this.live = false;
    const errors: unknown[] = [];
    for (const { resource } of this.held.splice(0).reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}

export class PluginRuntime<S> {
  private readonly definitions: readonly PluginDefinition<S>[];
  private readonly states = new Map<string, PluginState>();
  private readonly scopes = new Map<string, PluginScope<S>>();
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

  /** What each active plugin holds, by kind: the basis of the leak tests. */
  resources(): Record<string, string[]> {
    return Object.fromEntries([...this.scopes].map(([id, scope]) => [id, scope.held.map(held => held.kind)]));
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
   * it committed.
   */
  async enable(id: string): Promise<boolean> {
    const definition = this.definition(id);
    await this.activate(definition);
    return this.states.get(id) === 'active';
  }

  /** Stop a plugin, and first every active plugin that depends on it. */
  async disable(id: string): Promise<void> {
    for (const dependant of [...this.activationOrder].reverse()) {
      if (dependant !== id && this.dependsOn(dependant, id)) await this.deactivate(dependant);
    }
    await this.deactivate(id);
  }

  /** Stop everything, last activated first. */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const id of [...this.activationOrder].reverse()) await this.deactivate(id);
  }

  private async activate(definition: PluginDefinition<S>): Promise<void> {
    const { id, requires } = definition.manifest;
    if (this.disposed || this.states.get(id) === 'active') return;
    const missing = requires.filter(required => this.states.get(required) !== 'active');
    if (missing.length) {
      this.states.set(id, 'blocked');
      this.log.info(`${id} not started: needs ${missing.join(', ')}`);
      return;
    }
    const scope = new PluginScope<S>(id, <K extends keyof S>(name: K) => this.services.get(name)?.value as S[K] | undefined);
    try {
      await definition.activate(scope);
      if (this.disposed) throw new Error('the extension stopped while it was starting');
      this.commit(scope);
    } catch (error) {
      await this.rollback(scope, error);
    }
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
    const errors = await scope.release();
    this.states.set(scope.id, 'failed');
    this.log.error(`${scope.id} failed to start and was rolled back: ${describe(error)}`);
    for (const cleanup of errors) this.log.error(`${scope.id} rollback: ${describe(cleanup)}`);
  }

  private async deactivate(id: string): Promise<void> {
    const scope = this.scopes.get(id);
    if (!scope) return;
    // Withdraw the services before releasing what backs them.
    for (const [name, entry] of [...this.services]) {
      if (entry.owner === id) this.services.delete(name);
    }
    this.scopes.delete(id);
    this.activationOrder.splice(this.activationOrder.indexOf(id), 1);
    this.states.set(id, 'inactive');
    for (const error of await scope.release()) this.log.error(`${id} teardown: ${describe(error)}`);
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
