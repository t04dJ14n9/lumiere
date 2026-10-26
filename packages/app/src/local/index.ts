/**
 * The window's host in the web and iPad apps (`@workshop/app/local`): host-web
 * started in the window, and the backend the window talks to it through. The
 * embedder mounts its folders (vaults, and the host's data) and says where
 * the built editor, page shim and workers are.
 */
import type { LumiereHost, MenuContribution } from "@workshop/host-node/core";
import {
  startHostWeb,
  type EditorPageUrls,
  type Mounts,
} from "@workshop/host-web";
import type { Logger } from "@workshop/core";
import type {
  ContributedSetting,
  InkService,
  WorkerLauncher,
  WorkerName,
} from "@workshop/markdown/portable";
import type { WindowBackend } from "../shell/backend";
import { createLocalBackend, EventHub } from "./backend";
import { dataFile } from "./json-file";
import { LocalVaults } from "./vaults";

export { LocalVaults } from "./vaults";
export { WEB_HOST_OFFERS } from "./backend";

export interface LocalHostConfig {
  /** The vaults' folders and the host's data, mounted. */
  readonly files: Mounts;
  /** Where in `files` the host and the window keep their data (`/lumiere-data`). */
  readonly dataRoot: string;
  readonly workerUrl: (name: WorkerName) => string;
  /** Workers started some other way (a test under Node). */
  readonly workers?: WorkerLauncher;
  readonly contributed: readonly ContributedSetting[];
  readonly menus?: readonly MenuContribution[];
  readonly pages: EditorPageUrls;
  /** Let the reader pick a folder: mount it and give its path. */
  readonly pickFolder?: () => Promise<string | undefined>;
  readonly logger?: Logger;
  /** A canvas to draw on, where the app has one (the iPad's PencilKit). */
  readonly ink?: InkService;
}

export interface LocalHost {
  readonly backend: WindowBackend;
  readonly host: LumiereHost;
  readonly vaults: LocalVaults;
}

export async function startLocalHost(
  config: LocalHostConfig,
): Promise<LocalHost> {
  const { files, dataRoot } = config;
  const events = new EventHub();

  const host = await startHostWeb({
    files,
    dataRoot,
    workerUrl: config.workerUrl,
    ...(config.workers ? { workers: config.workers } : {}),
    contributed: config.contributed,
    ...(config.menus ? { menus: config.menus } : {}),
    ...(config.logger ? { logger: config.logger } : {}),
    ...(config.ink ? { ink: config.ink } : {}),
  });
  const vaults = new LocalVaults(
    files,
    dataFile(files, `${dataRoot}/window/vaults.json`),
    (event) => events.emit(event),
  );
  await vaults.load();
  const backend = createLocalBackend({
    host,
    files,
    vaults,
    layout: dataFile(files, `${dataRoot}/window/window.json`),
    events,
    pages: config.pages,
    ...(config.pickFolder ? { pickFolder: config.pickFolder } : {}),
  });
  return { backend, host, vaults };
}
