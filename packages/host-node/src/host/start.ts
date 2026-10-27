/**
 * Start Lumière's Markdown plugins outside VS Code: the same bootstrap VS
 * Code runs, over Node host services. Lumière's plugin tree is its own (on
 * its own Cordis); nothing from an embedder's plugin context enters it.
 */
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { createRoot, type Logger, type RootContext } from "@workshop/core";
import {
  bootstrap,
  MARKDOWN_EDITOR,
  pluginRank,
  type ContributedSetting,
  type HostSettings,
} from "@workshop/markdown/portable";
import {
  ContextKeys,
  registerContextMenus,
  type MenuContribution,
} from "./context-menu";
import { NoteDocuments } from "./documents";
import { PanelHub } from "./panels";
import {
  createHostCommands,
  createNodeHostServices,
  type HostIdentity,
} from "./services";
import { TreeHub } from "./trees";
import { createNodeVaultSystem } from "./vault";

export interface StartOptions {
  readonly identity: HostIdentity;
  /** The built editor (`packages/markdown/dist`); its workers parse the vault. */
  readonly markdown: string;
  /** Lumière's settings and defaults, from the extension's `contributes`. */
  readonly contributed: readonly ContributedSetting[];
  /** Lumière's right-click menu items (`menus.json`, written at build time). */
  readonly menus?: readonly MenuContribution[];
  /** Where settings, state and vault snapshots are kept. */
  readonly data: string;
  readonly logger: Logger;
}

export interface LumiereHost {
  readonly panels: PanelHub;
  /** The plugins' tree views (Outline, Backlinks…), for the embedder to show. */
  readonly trees: TreeHub;
  /** Lumière's settings, for the embedder's settings page. */
  readonly settings: HostSettings;
  /** A workspace a note was opened from; vaults are found inside these. */
  addRoot(root: string): void;
  stop(): Promise<void>;
}

export async function startLumiere(
  options: StartOptions,
): Promise<LumiereHost> {
  const roots = new Set<string>();
  const documents = new NoteDocuments();
  const panels = new PanelHub(documents);
  const markdownDist = options.markdown;
  const log = (message: string) => options.logger.warn(message);
  const keys = new ContextKeys();
  const commands = createHostCommands(log, keys);
  const trees = new TreeHub(commands);
  const host = createNodeHostServices({
    commands,
    trees,
    identity: options.identity,
    documents,
    panels,
    roots: () => [...roots],
    contributed: options.contributed,
    markdownDist,
    data: options.data,
    log,
  });
  const vault = createNodeVaultSystem({
    documents,
    settings: host.settings,
    roots: () => [...roots],
    storage: options.data,
    parserWorker: path.join(markdownDist, "workers", "vault.cjs"),
    warn: log,
  });
  const root: RootContext = createRoot({
    rank: pluginRank,
    logger: options.logger,
  });
  await bootstrap(host, vault, root);
  const stopMenus = registerContextMenus({
    panels,
    contributions: options.menus ?? [],
    keys,
    commands,
    viewType: MARKDOWN_EDITOR.viewType,
    log,
  });
  return {
    panels,
    trees,
    settings: host.settings,
    addRoot: (item) => {
      roots.add(item.replace(/\/+$/, ""));
    },
    async stop() {
      stopMenus();
      panels.dispose();
      await root.dispose();
      await documents.dispose();
    },
  };
}

/** Contributed settings from a `contributed.json` written at build time; none if missing. */
export async function readContributed(
  file: string,
): Promise<readonly ContributedSetting[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as ContributedSetting[];
  } catch {
    return [];
  }
}

/** Right-click menu items from a `menus.json` written at build time; none if missing. */
export async function readMenus(
  file: string,
): Promise<readonly MenuContribution[]> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(value)
      ? value.filter(
          (item): item is MenuContribution =>
            typeof item?.command === "string" &&
            typeof item?.title === "string",
        )
      : [];
  } catch {
    return [];
  }
}
