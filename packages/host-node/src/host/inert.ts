/**
 * Host services with no counterpart outside VS Code yet. Each answers the
 * way VS Code does when the feature is unavailable, so the plugins that use
 * them stay quiet instead of failing: no Git, no diff editor, no status bar
 * and no extra webview panels (the graph).
 */
import type {
  DiffViews,
  GitAccess,
  WorkbenchViews,
  HostNeed,
  VaultCodeTrust,
} from "@workshop/markdown/portable";

/**
 * An embedder that cannot ask its owner (DSH, so far) runs no code from a
 * vault: every vault reads as refused, so nothing asks either.
 */
export const noVaultCode: VaultCodeTrust = {
  answer: () => false,
  request: async () => false,
  onDidChange: () => () => {},
};

export const noGit: GitAccess = {
  blameLine: async () => ({ status: "unavailable", repoGeneration: 0 }),
  identity: async () => undefined,
  repoGeneration: () => 0,
  baseline: async () => ({ status: "unavailable" }),
  onDidChange: () => () => {},
  stage: async () => false,
  toGitUri: () => undefined,
};

export const noDiffViews: DiffViews = {
  onDidOpenDiff: () => () => {},
  openNative: async () => {},
  show: () => ({
    update: () => {},
    onDispose: () => () => {},
    dispose: () => {},
  }),
};

export const noViews: WorkbenchViews = {
  tree: () => ({
    refresh: () => {},
    setMessage: () => {},
    reveal: async () => {},
    visible: false,
    onVisibilityChanged: () => () => {},
    dispose: () => {},
  }),
  status: () => ({ show: () => {}, hide: () => {}, dispose: () => {} }),
  panel: () => ({
    reveal: () => {},
    setTitle: () => {},
    visible: false,
    onDidChangeVisibility: () => () => {},
    onDispose: () => () => {},
    dispose: () => {},
    webview: {
      cspSource: "'self'",
      asset: () => "",
      setHTML: () => {},
      post: () => {},
      onMessage: () => () => {},
    },
  }),
};

/**
 * What this host offers beyond the host services (Manifest `needs`): nothing
 * yet. Not VS Code's window; Git and panels are inert above. Add "git" when
 * GitAccess is real (HOSTS_PLAN M6), "panels" with `views.panel`: their
 * plugins' settings then show again by themselves.
 */
export const NODE_HOST_OFFERS: readonly HostNeed[] = [];
