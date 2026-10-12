import type { Disposer } from "../kernel";

/** What the git diff plugins compare a note with. */
export type GitRef = "HEAD" | "index";

export interface GitBaseline {
  /** The file's text at `ref`, with LF line endings. */
  readonly text: string;
  /** For people: "HEAD (a1c9f02)" or "Index". */
  readonly label: string;
}

export type GitBaselineResult =
  | { readonly status: "ok"; readonly baseline: GitBaseline }
  /** No repository, git disabled, or the file is outside any repository. */
  | { readonly status: "unavailable" }
  /** The file is in a repository but not at `ref` (new or untracked). */
  | { readonly status: "untracked" };

/**
 * Git through VS Code's built-in git extension (`vscode.git`, API 1). Plugins
 * never shell out; the host adapter owns the extension API.
 */
export interface GitAccess {
  baseline(uri: string, ref: GitRef): Promise<GitBaselineResult>;
  /** Repository state changed (commit, checkout, stage, a new repository). */
  onDidChange(listener: () => void): Disposer;
  /** Stage the whole file. */
  stage(uri: string): Promise<boolean>;
  /** The `git:` URI of `uri` at `ref`, for VS Code's own diff editor. */
  toGitUri(uri: string, ref: string): string | undefined;
}

/** A text diff tab VS Code opened for a Markdown file (Source Control, Timeline). */
export interface OpenedDiff {
  readonly original: string;
  readonly modified: string;
  readonly column: number | undefined;
  readonly preview: boolean;
  /** Close the native tab, unless it has unsaved changes. */
  close(): Promise<void>;
}

/** What one side of a rendered diff shows. */
export interface DiffSide {
  readonly uri: string;
  readonly label: string;
  readonly text: string;
}

export interface DiffPanel {
  update(left: DiffSide, right: DiffSide): void;
  onDispose(listener: () => void): Disposer;
  dispose(): void;
}

export interface DiffViews {
  onDidOpenDiff(listener: (diff: OpenedDiff) => void): Disposer;
  /** Open the native diff editor; its tab is not handed to `onDidOpenDiff`. */
  openNative(
    original: string,
    modified: string,
    title: string,
    column?: number,
  ): Promise<void>;
  show(options: {
    left: DiffSide;
    right: DiffSide;
    title: string;
    column: number | undefined;
    preview: boolean;
    /** Messages from the panel's buttons. */
    onAction(action: "openFile" | "openNative"): void;
  }): DiffPanel;
}
