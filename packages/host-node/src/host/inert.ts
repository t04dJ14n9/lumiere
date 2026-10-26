/**
 * Host services with no counterpart outside VS Code yet. Each answers the
 * way VS Code does when the feature is unavailable, so the plugins that use
 * them stay quiet instead of failing: no diff editor, no status bar and no
 * extra webview panels (the graph). Git is real (git.ts).
 */
import type {
  DiffViews,
  WorkbenchViews,
  HostNeed,
} from "@workshop/markdown/portable";

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
 * What this host offers beyond the host services (Manifest `needs`): Git
 * (git.ts), so blame and the change gutter have their settings. Not VS Code's
 * window, so the rendered diff editor, which needs both, stays hidden. Add
 * "panels" with `views.panel`: its plugins' settings then show by themselves.
 */
export const NODE_HOST_OFFERS: readonly HostNeed[] = ["git"];
