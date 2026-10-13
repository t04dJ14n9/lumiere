/**
 * Composition precedence: where each plugin's contributions go relative to
 * the others. This is NOT a dependency order (that is plugin-graph.ts) and
 * NOT a lifecycle order (the kernel starts a plugin when the services it
 * injects exist, whatever its place here).
 *
 * What the order decides, in both runtimes:
 *
 * - CodeMirror extension precedence: earlier editor features get their
 *   keymaps, decorations and input handlers first.
 * - Event listener rank: `Context.create({ rank: pluginRank })` sorts each
 *   event's listeners by this position, so a restarted plugin keeps its
 *   place.
 * - The order features appear in settings and the plugin list.
 *
 * Invariant: every catalog plugin appears exactly once (test/unit/plugins/
 * plugin-order.test.ts). Add a reason comment when the position matters.
 */

/** Core plugins, ranked ahead of every feature. */
export const CORE_ORDER = [
  "document",
  "editor",
  "dialect",
  "commands",
  "vault",
  "resources",
  "render",
  "livePreview",
  "markers",
  "settings",
] as const;

/** Editor features (they have an editor half), in precedence order. */
export const FEATURE_ORDER = [
  // Table navigation claims override keys before Vim.
  "tables",
  "properties",
  "inlineTitle",
  "pagePreview",
  // Claims video links before embeds renders them as images.
  "onlineVideos",
  "embeds",
  "tasks",
  "footnotes",
  "callouts",
  "diagrams",
  "math",
  "search",
  "codeBlocks",
  "links",
  "tags",
  "suggest",
  "formatting",
  "pasteHtml",
  "agentBridge",
  // Match VS Code: line numbers to the left of fold markers.
  "lineNumbers",
  // Git change bars sit between line numbers and fold markers, as in VS Code.
  "gitGutter",
  "folding",
  // Track changes over the bars' hunks; after the gutter it reads from.
  "gitInline",
  "indentGuides",
  "spellcheck",
  "autoPair",
  "smartLists",
  // Last: every feature above handles its keys before Vim sees them.
  "vim",
] as const;

/** Window-level features (native views, status bar), after editor features. */
export const WORKBENCH_FEATURE_ORDER = [
  "backlinks",
  "outgoingLinks",
  "outline",
  "quickSwitcher",
  "wordCount",
  "linkUpdates",
  // Bridge before wiki: wiki copy reads the bridge, and does not inject back.
  "bridge",
  "wiki",
  "assets",
  "scratch",
  "marp",
  "gitDiffEditor",
] as const;

const owners: readonly string[] = [
  ...CORE_ORDER,
  ...FEATURE_ORDER,
  ...WORKBENCH_FEATURE_ORDER,
];

/** An owner's precedence; owners not listed (external plugins) come last. */
export function pluginRank(owner: string): number {
  const index = owners.indexOf(owner);
  return index < 0 ? owners.length : index;
}

/** `items` sorted by their place in `order`; unlisted items throw. */
export function inPluginOrder<T extends { readonly id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const position = (item: T): number => {
    const index = order.indexOf(item.id);
    if (index < 0) {
      throw new Error(`${item.id} has no place in the plugin order`);
    }
    return index;
  };
  return [...items].sort((a, b) => position(a) - position(b));
}
