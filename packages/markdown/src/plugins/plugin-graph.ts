/**
 * The plugin dependency graph: which plugin needs which, derived from the
 * services each plugin half injects and provides. This is NOT precedence
 * (plugin-order.ts) and NOT lifecycle: the kernel gates and restarts plugins
 * on services at run time; the graph is the static picture of the same
 * declarations, so it can be checked (no cycles, no service without a
 * provider) and asked questions such as "what stops if this plugin is
 * turned off?".
 */
import type { Plugin, Services } from "@workshop/core";
import { HOST_SERVICE_NAMES } from "../shared/host";
import type {} from "@workshop/ink/service";

type ServiceName = keyof Services;

/** Services the host or webview root provides, not a plugin. */
export const ROOT_SERVICES: readonly ServiceName[] = [
  ...HOST_SERVICE_NAMES,
  "vaultSystem",
  "rpc",
  "pluginStates",
  // Only some hosts have a canvas (BootstrapOptions.ink).
  "ink",
];

/** What the graph reads from a plugin definition. */
export type PluginDeclaration = Pick<
  Plugin<never>,
  "name" | "inject" | "provides"
>;

export interface PluginNode {
  readonly id: string;
  /** Plugins this one cannot run without. */
  readonly requires: ReadonlySet<string>;
  /** Plugins this one uses when they run. */
  readonly optional: ReadonlySet<string>;
}

export class PluginGraph {
  readonly nodes: ReadonlyMap<string, PluginNode>;
  /** The plugin that provides each plugin-provided service. */
  readonly providers: ReadonlyMap<ServiceName, string>;

  /** Build from plugin definitions; a plugin's halves share its name. */
  constructor(definitions: readonly PluginDeclaration[]) {
    this.providers = providersOf(definitions);
    const nodes = new Map<
      string,
      { requires: Set<string>; optional: Set<string> }
    >();
    for (const { name, inject } of definitions) {
      const node = nodes.get(name) ?? {
        requires: new Set(),
        optional: new Set(),
      };
      for (const id of this.pluginsBehind(inject?.required, name)) {
        node.requires.add(id);
      }
      for (const id of this.pluginsBehind(inject?.optional, name)) {
        node.optional.add(id);
      }
      nodes.set(name, node);
    }
    this.nodes = new Map([...nodes].map(([id, node]) => [id, { id, ...node }]));
    this.activationOrder();
  }

  /** Plugins that stop (transitively) when `id` stops; optional uses do not count. */
  dependentsOf(id: string): string[] {
    const found = new Set<string>();
    const visit = (target: string): void => {
      for (const node of this.nodes.values()) {
        if (node.requires.has(target) && !found.has(node.id)) {
          found.add(node.id);
          visit(node.id);
        }
      }
    };
    visit(id);
    return [...found].sort();
  }

  /** The plugins behind `services`; a root service needs no plugin. */
  private pluginsBehind(
    services: readonly ServiceName[] | undefined,
    owner: string,
  ): string[] {
    return (services ?? []).flatMap((service) => {
      if (ROOT_SERVICES.includes(service)) {
        return [];
      }
      const provider = this.providers.get(service);
      if (!provider) {
        throw new Error(
          `${owner} injects ${service}, which no plugin provides`,
        );
      }
      return provider === owner ? [] : [provider];
    });
  }

  /**
   * Every plugin after the plugins it requires or uses. Throws on a cycle or
   * a dependency that is not in the graph.
   */
  activationOrder(): string[] {
    const order: string[] = [];
    const state = new Map<string, "visiting" | "done">();
    const visit = (id: string, path: readonly string[]): void => {
      if (state.get(id) === "done") {
        return;
      }
      if (state.get(id) === "visiting") {
        throw new Error(
          `Plugin dependency cycle: ${[...path, id].join(" -> ")}`,
        );
      }
      const node = this.nodes.get(id);
      if (!node) {
        throw new Error(
          `${path.at(-1) ?? "?"} depends on ${id}, which is not a plugin`,
        );
      }
      state.set(id, "visiting");
      for (const dependency of [...node.requires, ...node.optional]) {
        visit(dependency, [...path, id]);
      }
      state.set(id, "done");
      order.push(id);
    };
    for (const id of this.nodes.keys()) {
      visit(id, []);
    }
    return order;
  }
}

/** Each declared service and its plugin; two plugins may not share one. */
function providersOf(
  definitions: readonly PluginDeclaration[],
): Map<ServiceName, string> {
  const providers = new Map<ServiceName, string>();
  for (const { name, provides } of definitions) {
    for (const service of provides ?? []) {
      const other = providers.get(service);
      if (other !== undefined && other !== name) {
        throw new Error(`${service} is provided by both ${other} and ${name}`);
      }
      providers.set(service, name);
    }
  }
  return providers;
}
