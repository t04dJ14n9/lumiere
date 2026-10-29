/**
 * Lumière's host for Node processes other than VS Code. Its embedders:
 * packages/dsh (a DeepSeek Harness plugin) and packages/app (Lumière's own
 * server, which the desktop app runs). Nothing here may import `vscode`,
 * DSH or the app; the boundaries lint rule enforces it.
 */
export {
  readCommands,
  readContributed,
  readMenus,
  startLumiere,
  type LumiereHost,
  type StartOptions,
} from "./start";
export {
  createCommandPalette,
  paletteCommands,
  type CommandContribution,
  type CommandPalette,
  type PaletteCommand,
} from "./command-palette";
export {
  BASE,
  SOCKET_PATH,
  createEditorRoutes,
  type EditorAssets,
  type EditorRoutes,
} from "./routes";
export type { HostIdentity } from "./services";
/** A setting and its default (StartOptions.contributed), for an embedder that changes defaults. */
export type { ContributedSetting } from "@workshop/markdown/portable";
export type { MenuContribution } from "./context-menu";
export { serveFile, serveStatic } from "./static";
export { listNodeVault as listVault } from "./node-platform";
export { isInside } from "./paths";
