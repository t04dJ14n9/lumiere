/**
 * Lumière's host without Node (`@workshop/host-web`): the shared host
 * (`@workshop/host-node/core`) on folders a browser or an iPad can reach, for
 * the web app and the iPad app. The embedder mounts its folders, starts the
 * host, and opens notes in pages; its window talks to the host in-process.
 */
import {
  startHost,
  type HostIdentity,
  type LumiereHost,
  type MenuContribution,
} from "@workshop/host-node/core";
import { silentLogger, type Logger } from "@workshop/core";
import type {
  ContributedSetting,
  VaultCodeTrust,
  WorkerLauncher,
  WorkerName,
} from "@workshop/markdown/portable";
import type { Mounts } from "./mounts";
import { createWebPlatform } from "./platform";
import { webWorkerLauncher } from "./workers";

export { Mounts } from "./mounts";
export { MemoryFileSystem, type MemoryEntry, type Persist } from "./memory-fs";
export { notFound, type VaultFileInfo, type VaultFileSystem } from "./vault-fs";
export { openEditorPage, type EditorPage, type EditorPageUrls } from "./pages";
export { createWebPlatform } from "./platform";
export { sha256 } from "./sha256";
export { webWorkerLauncher } from "./workers";
export type { LumiereHost } from "@workshop/host-node/core";

export interface HostWebOptions {
  /** The vaults' folders and the host's own data, mounted. */
  readonly files: Mounts;
  /** Where in `files` the host keeps its data (`/lumiere-data`). */
  readonly dataRoot: string;
  /** The URL of a built worker script (`vault.web.js`, `search.web.js`). */
  readonly workerUrl: (name: WorkerName) => string;
  /** Workers started some other way (a test under Node); `workerUrl` is then unused. */
  readonly workers?: WorkerLauncher;
  /** Lumière's settings and defaults (`contributed.json`, written at build time). */
  readonly contributed: readonly ContributedSetting[];
  /** Lumière's right-click menu items (`menus.json`). */
  readonly menus?: readonly MenuContribution[];
  readonly identity?: HostIdentity;
  readonly logger?: Logger;
  /** Asks the owner whether a vault's own code may run; without it, none runs. */
  readonly vaultCode?: VaultCodeTrust;
}

export function startHostWeb(options: HostWebOptions): Promise<LumiereHost> {
  const platform = createWebPlatform({
    files: options.files,
    dataRoot: options.dataRoot,
    workers: options.workers ?? webWorkerLauncher(options.workerUrl),
  });
  return startHost(platform, {
    identity: options.identity ?? { appName: "Lumière", uriScheme: "lumiere" },
    contributed: options.contributed,
    ...(options.menus ? { menus: options.menus } : {}),
    logger: options.logger ?? silentLogger,
    ...(options.vaultCode ? { vaultCode: options.vaultCode } : {}),
  });
}
