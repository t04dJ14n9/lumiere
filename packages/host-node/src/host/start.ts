/**
 * Start Lumière's Markdown plugins in a Node process (DSH, the app's server):
 * the shared host (start-host.ts) on Node's platform (node-platform.ts).
 */
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { ContributedSetting } from "@workshop/markdown/portable";
import { parseMenus, type MenuContribution } from "./context-menu";
import { createNodePlatform } from "./node-platform";
import {
  startHost,
  type HostStartOptions,
  type LumiereHost,
} from "./start-host";

export type { LumiereHost } from "./start-host";

export interface StartOptions extends HostStartOptions {
  /** The built editor (`packages/markdown/dist`); its workers parse the vault. */
  readonly markdown: string;
  /** Where settings, state and vault snapshots are kept. */
  readonly data: string;
}

export function startLumiere(options: StartOptions): Promise<LumiereHost> {
  const platform = createNodePlatform({
    data: options.data,
    workers: path.join(options.markdown, "workers"),
  });
  return startHost(platform, options);
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
    return parseMenus(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return [];
  }
}
