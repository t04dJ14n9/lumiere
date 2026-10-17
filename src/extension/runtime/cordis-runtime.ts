/**
 * Cordis-backed host runtime façade (Stage B).
 *
 * Presents the same PluginRuntime / PluginHostScope surface plugins use today,
 * implemented on CordisApplication (public Cordis + app-owned lifetime shim).
 * Production default remains native; extension.ts selects this when the
 * runtimeImpl flag is "cordis".
 */
import { Context } from 'cordis';
import { CordisApplication } from './cordis-shim/application';
import type { CordisDefinition, CordisScope } from './cordis-shim/application';
import type { PluginManifest } from './manifest';
import {
  activationOrder,
  type PluginDefinition,
  type PluginHostScope,
  type PluginState,
  type Resource,
  type RuntimeLog,
} from './plugin-runtime';

interface Held {
  kind: string;
  resource: Resource;
}

/** PluginHostScope backed by one Cordis apply + Lifetime. */
class CordisPluginScope<S> implements PluginHostScope<S> {
  readonly held: Held[] = [];

  constructor(
    readonly id: string,
    private readonly cordis: CordisScope<S>,
    private readonly lookup: <K extends keyof S>(name: K) => S[K] | undefined,
  ) {}

  acquire<T extends Resource>(resource: T, kind = 'resource'): T {
    try {
      this.cordis.acquire(async () => {
        await resource.dispose();
      });
    } catch {
      throw new Error(`${this.id} acquired a ${kind} after it stopped`);
    }
    this.held.push({ kind, resource });
    return resource;
  }

  provide<K extends keyof S>(name: K, value: S[K]): void {
    this.cordis.provide(name as keyof S & string, value as S[keyof S & string]);
  }

  get<K extends keyof S>(name: K): S[K] {
    return this.cordis.get(name as keyof S & string) as S[K];
  }

  find<K extends keyof S>(name: K): S[K] | undefined {
    return this.lookup(name);
  }
}

/**
 * Same callable surface as PluginRuntime, backed by CordisApplication.
 * Deactivate/dispose permanently closes the app child lifetime (never the
 * infrastructure root).
 */
export class CordisPluginRuntime<S extends object> {
  private readonly definitions: readonly PluginDefinition<S>[];
  private readonly app: CordisApplication<S>;
  private readonly root: Context;
  private readonly detachRoot: Array<() => void | Promise<void>> = [];
  private readonly scopes = new Map<string, CordisPluginScope<S>>();
  private closed = false;

  constructor(
    definitions: readonly PluginDefinition<S>[],
    private readonly log: RuntimeLog,
    rootServices: Partial<S> = {},
  ) {
    this.definitions = activationOrder(definitions);
    this.root = new Context();
    for (const [name, value] of Object.entries(rootServices) as [keyof S & string, S[keyof S & string]][]) {
      this.detachRoot.push(this.root.provide(name, value));
    }
    const cordisDefinitions: CordisDefinition<S>[] = this.definitions.map((definition) => {
      const { id, requires, optional, provides } = definition.manifest;
      return {
        id,
        ...(requires.length ? { requires } : {}),
        ...(optional?.length ? { optional } : {}),
        ...(provides?.length ? { provides: [...provides] as (keyof S & string)[] } : {}),
        apply: (cordisScope) => this.apply(definition, cordisScope),
      };
    });
    this.app = new CordisApplication<S>(
      cordisDefinitions,
      (error) => this.log.error(describe(error)),
      this.root,
    );
  }

  get plugins(): readonly PluginManifest<keyof S & string>[] {
    return this.definitions.map((definition) => definition.manifest);
  }

  state(id: string): PluginState | undefined {
    if (!this.definitions.some((definition) => definition.manifest.id === id)) return undefined;
    return this.app.state(id);
  }

  resources(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.scopes].map(([id, scope]) => [id, scope.held.map((held) => held.kind)]),
    );
  }

  async start(only?: (id: string) => boolean): Promise<void> {
    for (const definition of this.definitions) {
      if (only && !only(definition.manifest.id)) continue;
      await this.enable(definition.manifest.id);
    }
  }

  async enable(id: string): Promise<boolean> {
    if (this.closed) return false;
    this.definition(id);
    await this.app.enable(id);
    const active = this.app.state(id) === 'active';
    this.pruneScopes();
    if (!active && this.app.state(id) === 'blocked') {
      this.log.info(`${id} not started: waiting on required services`);
    }
    return active;
  }

  async disable(id: string): Promise<void> {
    this.definition(id);
    // Mirror native: stop (optional+required) dependants through this façade so
    // scopes stay in sync; CordisApplication.disable joins the same barriers.
    const dependants = this.definitions.map((definition) => definition.manifest.id)
      .filter((other) => other !== id && this.dependsOn(other, id)).reverse();
    for (const dependant of dependants) await this.disable(dependant);
    await this.app.disable(id);
    this.pruneScopes();
  }

  async dispose(): Promise<void> {
    this.closed = true;
    await this.app.dispose();
    this.scopes.clear();
    for (const detach of this.detachRoot.splice(0)) await detach();
  }

  /** Drop scopes whose Cordis fibers are no longer live. */
  private pruneScopes(): void {
    for (const id of [...this.scopes.keys()]) {
      const state = this.app.state(id);
      if (state !== 'active' && state !== 'starting' && state !== 'stopping') this.scopes.delete(id);
    }
  }

  private dependsOn(id: string, target: string, seen = new Set<string>()): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    const { requires, optional = [] } = this.definition(id).manifest;
    return [...requires, ...optional].some((next) => next === target || this.dependsOn(next, target, seen));
  }

  private async apply(definition: PluginDefinition<S>, cordisScope: CordisScope<S>): Promise<void> {
    const scope = new CordisPluginScope<S>(
      definition.manifest.id,
      cordisScope,
      <K extends keyof S>(name: K) => this.app.find(name as keyof S & string) as S[K] | undefined,
    );
    this.scopes.set(definition.manifest.id, scope);
    await definition.activate(scope);
  }

  private definition(id: string): PluginDefinition<S> {
    const definition = this.definitions.find((candidate) => candidate.manifest.id === id);
    if (!definition) throw new Error(`No plugin ${id}`);
    return definition;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
