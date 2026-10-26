/**
 * The shared host, for a platform without Node (`@workshop/host-node/core`):
 * Lumière's plugins started on a `HostPlatform` the embedder provides, and
 * the pages, panels and right-click menu that serve them. host-web is its
 * first embedder; host-node's own entry wraps it on Node's platform.
 * test/unit/core-layers.test.ts keeps every Node built-in out of it.
 *
 * It lives in host-node until the PRs open against these files land, then
 * moves to its own package (docs/HOSTS_PLAN.md section 3).
 */
export {
  startHost,
  type HostStartOptions,
  type LumiereHost,
} from "./host/start-host";
export {
  containInRoots,
  OutsideWorkspace,
  type HostEntry,
  type HostFileInfo,
  type HostFiles,
  type HostPlatform,
  type HostStore,
} from "./host/platform";
export { fileUri, joinUri, parentUri, uriName, uriPath } from "./host/uris";
export { injectShim } from "./host/page";
export { parseMenus, type MenuContribution } from "./host/context-menu";
export type { PageSocket, PanelUrls } from "./host/panel";
export type { HostIdentity } from "./host/services";
export { SETTINGS_FILE } from "./host/settings";
export {
  createSettingsService,
  type SettingsService,
} from "./host/settings-service";
export { listVault } from "./host/vault";
export type { TreeHub } from "./host/trees";
export { STATE_FILE } from "./host/workspace";
