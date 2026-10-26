/**
 * What another editor needs to run Lumière's Markdown plugins over its own
 * host services: the bootstrap, the contracts those services implement, and
 * the helpers the VS Code adapter is built from that need no VS Code.
 * Nothing this module imports may reach `vscode` (see test/unit/layers.test.ts).
 */
export { bootstrap, type BootstrapOptions } from "./bootstrap";
export {
  pluginRank,
  pluginTitles,
  settingsUnavailableIn,
} from "../plugins/catalog";
export type { HostNeed } from "../shared/manifest";
export { checkWrite, SETTING_PREFIX } from "../shared/setting-schema";
export {
  EffectiveConfiguration,
  type ConfigurationSource,
} from "./configuration";
export { readSettings } from "./settings";
export { createVaultParser } from "./vault-parser";
export { isIgnoredPath } from "../plugins/vault/exclusion";
export { MARKDOWN_EDITOR } from "../shared/editor-provider";
export { RevealRouter, chooseRevealPanel } from "./reveal-router";
export { SourceCoordinates } from "../shared/document/coordinates";
export type * from "../shared/host";
export type {
  FileEvent,
  ListedFile,
  SnapshotStore,
  VaultSettings,
  VaultSystem,
} from "../plugins/vault/api";
export type { Transport } from "../shared/rpc/endpoint";
export type {
  DiffViews,
  GitAccess,
  GitBaselineResult,
  GitRef,
} from "../shared/git";
export type {
  GitBlameLineResult,
  GitBlameSnapshot,
  GitIdentity,
} from "../shared/git-blame";
export { exceedsDiffLimits, MAX_DIFF_CHARS } from "../shared/diff/limits";
// Git over the command line, which VS Code's adapter falls back to when its
// git extension has not opened a repository; a Node host uses them alone.
export {
  createSpawnBlameRunner,
  discoverGitRoot,
  runBlameLine,
  type GitBlameRunner,
} from "./git-blame";
export { RepositoryWatch } from "./git-watch";
export { bindDiscoveredRoot, canonicalPath } from "./git-discovered-watch";
export type { DiagnosticSink, WorkspaceFiles } from "../shared/workspace-files";
export type { EditorProvider } from "../shared/editor-provider";
