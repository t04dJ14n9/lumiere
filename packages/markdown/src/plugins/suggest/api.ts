import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { Disposer } from "@workshop/core";
import type { Query } from "./protocol";
export interface SuggestionContext {
  state: EditorState;
  pos: number;
}
export interface SuggestionTrigger extends Query {
  from: number;
  closeLink: boolean;
  /**
   * Accepting keeps what was typed and only finishes the link, as Obsidian
   * does while an alias is typed after `|`.
   */
  keepTyped?: boolean;
  /** Accepting with Enter adds a space after, as Obsidian does for a tag. */
  spaceAfter?: boolean;
}
/** One entry of a list the webview makes itself. */
export interface LocalSuggestion {
  label: string;
  /** Build the acceptance edit from the current document and completion range. */
  apply: (
    state: EditorState,
    range: { from: number; to: number },
  ) => TransactionSpec;
  /** A swatch of this highlight colour (`default` too) before the label. */
  swatch?: string;
}
/**
 * A list the webview makes itself, with no request to the host (highlight
 * colours after `==`). Tab does not take an entry, as in Obsidian.
 */
export interface LocalSuggestions {
  at: number;
  options: readonly LocalSuggestion[];
}
export type SuggestionSource = (
  context: SuggestionContext,
) => SuggestionTrigger | LocalSuggestions | undefined;
export interface Suggest {
  register(source: SuggestionSource): Disposer;
}
declare module "@workshop/core" {
  interface Services {
    suggest: Suggest;
  }
  interface Events {
    /** @mode bail */ "suggest/trigger": SuggestionSource;
  }
}
