/**
 * Start Lumière's Markdown plugins outside VS Code, on any platform: the same
 * bootstrap VS Code runs, over the shared host services. Lumière's plugin
 * tree is its own (on its own Cordis); nothing from an embedder's plugin
 * context enters it. Node's entry is start.ts; a browser's is host-web.
 */
import { createRoot, type Logger, type RootContext } from "@workshop/core";
import {
  bootstrap,
  MARKDOWN_EDITOR,
  pluginRank,
  type ContributedSetting,
  type HostServices,
  type HostSettings,
  type VaultCodeTrust,
} from "@workshop/markdown/portable";
import {
  ContextKeys,
  registerContextMenus,
  type MenuContribution,
} from "./context-menu";
import { NoteDocuments, noteFiles } from "./documents";
import { noVaultCode } from "./inert";
import { PanelHub } from "./panels";
import type { HostPlatform } from "./platform";
import {
  createHostCommands,
  createHostServices,
  type HostIdentity,
} from "./services";
import { SETTINGS_FILE } from "./settings";
import { TreeHub } from "./trees";
import { uriName } from "./uris";
import { createHostVaultSystem } from "./vault";
import { STATE_FILE } from "./workspace";

export interface HostStartOptions {
  readonly identity: HostIdentity;
  /** Lumière's settings and defaults, from the extension's `contributes`. */
  readonly contributed: readonly ContributedSetting[];
  /** Lumière's right-click menu items (`menus.json`, written at build time). */
  readonly menus?: readonly MenuContribution[];
  readonly logger: Logger;
  /**
   * Asks the owner whether a vault's own code (Obsidian community plugins)
   * may run, once per vault. Without it, none runs.
   */
  readonly vaultCode?: VaultCodeTrust;
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

export async function startHost(
  platform: HostPlatform,
  options: HostStartOptions,
): Promise<LumiereHost> {
  const roots = new Set<string>();
  const documents = new NoteDocuments(noteFiles(platform));
  const panels = new PanelHub(documents);
  const log = (message: string) => options.logger.warn(message);
  const keys = new ContextKeys();
  const commands = createHostCommands(log, keys);
  const trees = new TreeHub(commands);
  const host = createHostServices({
    platform,
    commands,
    trees,
    identity: options.identity,
    documents,
    panels,
    roots: () => [...roots],
    contributed: options.contributed,
    saved: await readSaved(platform),
    log,
    vaultCode: options.vaultCode ?? noVaultCode,
  });
  reportSaveFailures(documents, host.dialogs);
  const vault = createHostVaultSystem({
    platform,
    documents,
    settings: host.settings,
    roots: () => [...roots],
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

/** The reader's settings and the workspace state, as the store holds them. */
async function readSaved(platform: HostPlatform) {
  const [settings, state] = await Promise.all([
    platform.store.read(SETTINGS_FILE),
    platform.store.read(STATE_FILE),
  ]);
  return { settings, state };
}

/** Tell the reader when a note could not be written: its text stays open. */
function reportSaveFailures(
  documents: NoteDocuments,
  dialogs: Pick<HostServices["dialogs"], "error">,
): void {
  documents.onSaveFailed((uri, error) =>
    dialogs.error(
      `Lumière could not save ${uriName(uri)}: ${
        error instanceof Error ? error.message : String(error)
      }. Your text is still open; copy it somewhere safe.`,
    ),
  );
}
