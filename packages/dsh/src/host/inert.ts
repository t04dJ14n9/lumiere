/**
 * Host services DSH has no counterpart for yet. Each answers the way VS Code
 * does when the feature is unavailable, so the plugins that use them stay
 * quiet instead of failing: no Git, no diff editor, no tree views or status
 * bar, and no extra webview panels (the graph).
 */
import type {
  DiffViews,
  GitAccess,
  WorkbenchViews,
} from "@workshop/markdown/portable";

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
