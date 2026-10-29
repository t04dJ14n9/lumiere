/**
 * The plugins' tree views as an embedder's page sees them (Outline,
 * Backlinks, Tags, Outgoing Links): what host/view-routes.ts sends. Browser-
 * safe: packages/app's shell and packages/dsh's client import it.
 */

/** Where the routes are, below host/routes.ts's `BASE`. */
export const VIEWS_PATH = "/lumiere/views";

/** The plugins' view ids (packages/markdown/src/plugins/<plugin>/commands.ts). */
export const VIEW_IDS = {
  outline: "lumiere.markdown.outline",
  backlinks: "lumiere.markdown.backlinks",
  outgoingLinks: "lumiere.markdown.outgoingLinks",
  tags: "lumiere.markdown.tags",
} as const;

/** A node as the embedder shows it. */
export interface TreeItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
  /** A codicon name, such as `symbol-string`. */
  readonly icon?: string;
  /** Undefined for a leaf; otherwise whether it starts expanded. */
  readonly expanded?: boolean;
  /** Whether clicking it does something. */
  readonly runnable: boolean;
  readonly children?: readonly TreeItem[];
}

export interface TreeSnapshot {
  readonly viewId: string;
  /** Shown above the tree ("No headings."). */
  readonly message?: string;
  readonly items: readonly TreeItem[];
  /** The snapshot stopped at MAX_NODES. */
  readonly truncated: boolean;
}

export type TreeEvent =
  | { readonly type: "changed"; readonly viewId: string }
  /** Show this node (the caret's heading); select it when `select`. */
  | {
      readonly type: "reveal";
      readonly viewId: string;
      readonly id: string;
      readonly select: boolean;
    }
  | {
      readonly type: "expand";
      readonly viewId: string;
      readonly id: string;
    }
  | {
      readonly type: "collapse";
      readonly viewId: string;
      readonly id: string;
    };
