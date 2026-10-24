/**
 * Lumière's host for Node processes other than VS Code. Its embedders:
 * packages/dsh (a DeepSeek Harness plugin) and packages/app (Lumière's own
 * server, which the desktop app runs). Nothing here may import `vscode`,
 * DSH or the app; the boundaries lint rule enforces it.
 */
export {
  readContributed,
  readMenus,
  startLumiere,
  type LumiereHost,
  type StartOptions,
} from "./start";
export {
  BASE,
  SOCKET_PATH,
  createEditorRoutes,
  type EditorAssets,
  type EditorRoutes,
} from "./routes";
export type { HostIdentity } from "./services";
export type { MenuContribution } from "./context-menu";
export { serveFile, serveStatic } from "./static";
export { listVault, isInside } from "./vault";
