/**
 * Start Lumière's Markdown plugins in DSH: the same bootstrap VS Code runs,
 * over DSH's host services. Lumière's plugin tree is its own (on its own
 * Cordis); nothing from DSH's plugin context enters it.
 */
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { createRoot, type Logger, type RootContext } from "@workshop/core";
import {
  bootstrap,
  pluginRank,
  type ContributedSetting,
} from "@workshop/markdown/portable";
import { NoteDocuments } from "./documents";
import { PanelHub } from "./panels";
import { createDshHostServices } from "./services";
import { createNodeVaultSystem } from "./vault";

export interface StartOptions {
  /** The installed bundle: `markdown/` (the built editor) and `contributed.json`. */
  readonly bundle: string;
  /** The plugin's data folder (settings, state, vault snapshots). */
  readonly data: string;
  readonly logger: Logger;
}

export interface LumiereHost {
  readonly panels: PanelHub;
  /** A DSH workspace a note was opened from; vaults are found inside these. */
  addRoot(root: string): void;
  stop(): Promise<void>;
}

export async function startLumiere(
  options: StartOptions,
): Promise<LumiereHost> {
  const roots = new Set<string>();
  const documents = new NoteDocuments();
  const panels = new PanelHub(documents);
  const markdownDist = path.join(options.bundle, "markdown");
  const log = (message: string) => options.logger.warn(message);
  const host = createDshHostServices({
    documents,
    panels,
    roots: () => [...roots],
    contributed: await readContributed(options.bundle),
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
  return {
    panels,
    addRoot: (item) => {
      roots.add(item.replace(/\/+$/, ""));
    },
    async stop() {
      panels.dispose();
      await root.dispose();
      await documents.dispose();
    },
  };
}

/** The extension's contributed settings, copied into the bundle when it is built. */
async function readContributed(
  bundle: string,
): Promise<readonly ContributedSetting[]> {
  try {
    const text = await readFile(path.join(bundle, "contributed.json"), "utf8");
    return JSON.parse(text) as ContributedSetting[];
  } catch {
    return [];
  }
}
