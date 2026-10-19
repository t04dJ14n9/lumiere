import type { Disposer } from "@workshop/core";
import type { Cancellation } from "../rpc/lifecycle";

export interface NavigationTarget {
  fragment: string;
  at?: number;
}

export interface RevealPanel {
  readonly id: string;
  readonly uri: string;
  active(): boolean;
  reveal(
    target: NavigationTarget & { requestId: number },
    token: Cancellation,
  ): Promise<boolean>;
}

export interface NavigationIntent {
  column?: number;
  requestId: number;
  token: Cancellation & { cancel(): void };
}

/**
 * Where a link opens: in the current editor group (`here`), in a tab of its
 * own that stays open rather than a preview (`tab`, Obsidian's Cmd-click),
 * or in the group beside (`side`).
 */
export type OpenPlace = "here" | "tab" | "side";

/** Opening notes, links and locations in VS Code. */
export interface Navigation {
  begin?(): NavigationIntent;
  registerReveal(panel: RevealPanel): Disposer;
  /** VS Code's document link provider for notes opened as text. */
  registerNativeLinks(): Disposer;
  readonly scheme: string;
  external(href: string): Promise<boolean>;
  confirm(message: string): Promise<boolean>;
  resolve(request: {
    root: string;
    source: string;
    path: string;
    create: boolean;
    folderNote: string;
    newNoteFolder?: string;
    intent?: NavigationIntent;
  }): Promise<string | undefined>;
  open(
    root: string,
    uri: string,
    fragment: string,
    place: OpenPlace,
    at?: number,
    intent?: NavigationIntent,
  ): Promise<void>;
}
