/**
 * The plugins' tree views outside VS Code: Outline, Backlinks, Tags,
 * Outgoing Links. A plugin fills a tree through `views.tree` exactly as in
 * VS Code; the embedder shows it. It reads a snapshot, hears when a tree
 * changed or wants a node revealed, says whether the tree is on screen, and
 * runs a node's command when the reader clicks it (routes.ts serves this).
 */
import type {
  HostCommands,
  TreeHandle,
  TreeNode,
  TreeSource,
  WorkbenchViews,
} from "@workshop/markdown/portable";
import type { TreeEvent, TreeItem, TreeSnapshot } from "../views";

export type { TreeEvent, TreeItem, TreeSnapshot } from "../views";

/** A tree has at most this many nodes in a snapshot; the rest are left out. */
const MAX_NODES = 5000;
const MAX_DEPTH = 16;

interface LiveTree {
  readonly source: TreeSource;
  message: string | undefined;
  visible: boolean;
  readonly visibility: Set<(visible: boolean) => void>;
  /** The nodes of the last snapshot, by id, for running their commands. */
  nodes: Map<string, TreeNode>;
}

export class TreeHub {
  private readonly trees = new Map<string, LiveTree>();
  private readonly listeners = new Set<(event: TreeEvent) => void>();

  constructor(private readonly commands: Pick<HostCommands, "execute">) {}

  /** `views.tree` for the plugins. */
  readonly tree: WorkbenchViews["tree"] = (viewId, source) => {
    const tree: LiveTree = {
      source,
      message: undefined,
      visible: false,
      visibility: new Set(),
      nodes: new Map(),
    };
    this.trees.set(viewId, tree);
    this.emit({ type: "changed", viewId });
    return this.handle(viewId, tree);
  };

  /** The trees plugins have registered, by view id. */
  ids(): readonly string[] {
    return [...this.trees.keys()];
  }

  async snapshot(viewId: string): Promise<TreeSnapshot | undefined> {
    const tree = this.trees.get(viewId);
    if (!tree) {
      return undefined;
    }
    const nodes = new Map<string, TreeNode>();
    const budget = { left: MAX_NODES };
    const items = await this.items(tree.source, undefined, {
      nodes,
      budget,
      depth: 0,
    });
    if (this.trees.get(viewId) === tree) {
      tree.nodes = nodes;
    }
    return {
      viewId,
      ...(tree.message === undefined ? {} : { message: tree.message }),
      items,
      truncated: budget.left <= 0,
    };
  }

  /** The reader clicked a node: run its command. False when there is no such node. */
  async run(viewId: string, id: string): Promise<boolean> {
    const command = this.trees.get(viewId)?.nodes.get(id)?.command;
    if (!command) {
      return false;
    }
    await this.commands.execute(command.id, ...(command.args ?? []));
    return true;
  }

  /** The embedder shows or hides a tree (its sidebar tab, say). */
  setVisible(viewId: string, visible: boolean): void {
    const tree = this.trees.get(viewId);
    if (!tree || tree.visible === visible) {
      return;
    }
    tree.visible = visible;
    for (const listener of tree.visibility) {
      listener(visible);
    }
  }

  onEvent(listener: (event: TreeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handle(viewId: string, tree: LiveTree): TreeHandle {
    const live = () => this.trees.get(viewId) === tree;
    return {
      refresh: () => {
        if (live()) {
          this.emit({ type: "changed", viewId });
        }
      },
      setMessage: (message) => {
        if (live() && tree.message !== message) {
          tree.message = message;
          this.emit({ type: "changed", viewId });
        }
      },
      reveal: async (node, options) => {
        if (live()) {
          this.emit({
            type: "reveal",
            viewId,
            id: node.id,
            select: options?.select ?? false,
          });
        }
      },
      get visible() {
        return tree.visible;
      },
      onVisibilityChanged: (listener) => {
        tree.visibility.add(listener);
        return () => {
          tree.visibility.delete(listener);
        };
      },
      dispose: () => {
        if (live()) {
          this.trees.delete(viewId);
          this.emit({ type: "changed", viewId });
        }
      },
    };
  }

  private async items(
    source: TreeSource,
    parent: TreeNode | undefined,
    walk: {
      nodes: Map<string, TreeNode>;
      budget: { left: number };
      depth: number;
    },
  ): Promise<TreeItem[]> {
    const nodes = parent ? await source.children(parent) : await source.roots();
    const items: TreeItem[] = [];
    for (const node of nodes) {
      if (walk.budget.left <= 0) {
        break;
      }
      walk.budget.left--;
      walk.nodes.set(node.id, node);
      const children =
        node.expanded === undefined || walk.depth >= MAX_DEPTH
          ? undefined
          : await this.items(source, node, { ...walk, depth: walk.depth + 1 });
      items.push(toItem(node, children));
    }
    return items;
  }

  private emit(event: TreeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function toItem(node: TreeNode, children: TreeItem[] | undefined): TreeItem {
  return {
    id: node.id,
    label: node.label,
    ...(node.description === undefined
      ? {}
      : { description: node.description }),
    ...(node.tooltip === undefined ? {} : { tooltip: node.tooltip }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    ...(node.expanded === undefined ? {} : { expanded: node.expanded }),
    runnable: node.command !== undefined,
    ...(children === undefined ? {} : { children }),
  };
}

/** `views` for a Node host: real trees; status entries and extra panels do nothing yet. */
export function nodeViews(
  trees: TreeHub,
  inert: WorkbenchViews,
): WorkbenchViews {
  return { tree: trees.tree, status: inert.status, panel: inert.panel };
}
