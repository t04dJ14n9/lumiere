/**
 * The plugin dependency graph: which plugin needs which, derived from the
 * services each plugin half injects and the plugin that provides each
 * service. This is NOT precedence (plugin-order.ts) and NOT lifecycle: the
 * kernel gates and restarts plugins on services at run time; the graph is
 * the static picture of the same declarations, so it can be checked
 * (no cycles, no service without a provider) and asked questions such as
 * "what stops if this plugin is turned off?".
 *
 * Invariant: `SERVICE_PROVIDERS` names the plugin that really provides each
 * service; test/unit/features/lifecycle.test.ts checks it against the
 * providers a running kernel records.
 */
import type { Plugin, Services } from "../kernel";

/** Services the host or webview root provides, not a plugin. */
export const ROOT_SERVICES: readonly (keyof Services)[] = [
  "workbench",
  "vaultSystem",
  "rpc",
];

/** Which plugin provides each plugin-provided service. */
export const SERVICE_PROVIDERS: Readonly<
  Partial<Record<keyof Services, string>>
> = {
  markdown: "dialect",
  document: "document",
  documents: "document",
  editor: "editor",
  editors: "editor",
  selections: "editor",
  menu: "editor",
  editorActions: "editor",
  commands: "commands",
  livePreview: "livePreview",
  render: "render",
  resources: "resources",
  diffResources: "resources",
  vault: "vault",
  vaults: "vault",
  markers: "markers",
  fold: "folding",
  formatting: "formatting",
  suggest: "suggest",
  codeBlocks: "codeBlocks",
  vim: "vim",
  bridgeCapture: "bridge",
  wikiLayout: "wiki",
  links: "links",
  gitDiff: "gitGutter",
};

export interface PluginNode {
  readonly id: string;
  /** Plugins this one cannot run without. */
  readonly requires: ReadonlySet<string>;
  /** Plugins this one uses when they run. */
  readonly optional: ReadonlySet<string>;
}

/** The plugin ids behind `services`; a root service needs no plugin. */
function providersOf(
  services: readonly (keyof Services)[] | undefined,
  owner: string,
): string[] {
  return (services ?? []).flatMap((service) => {
    if (ROOT_SERVICES.includes(service)) {
      return [];
    }
    const provider = SERVICE_PROVIDERS[service];
    if (!provider) {
      throw new Error(`${owner} injects ${service}, which no plugin provides`);
    }
    return provider === owner ? [] : [provider];
  });
}

export class PluginGraph {
  readonly nodes: ReadonlyMap<string, PluginNode>;

  /** Build from plugin definitions; a plugin's halves share its name. */
  constructor(definitions: readonly Pick<Plugin<never>, "name" | "inject">[]) {
    const nodes = new Map<
      string,
      { requires: Set<string>; optional: Set<string> }
    >();
    for (const { name, inject } of definitions) {
      const node = nodes.get(name) ?? {
        requires: new Set(),
        optional: new Set(),
      };
      for (const id of providersOf(inject?.required, name)) {
        node.requires.add(id);
      }
      for (const id of providersOf(inject?.optional, name)) {
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
