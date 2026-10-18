import type { EditorState } from "@codemirror/state";
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
export type SuggestionSource = (
  context: SuggestionContext,
) => SuggestionTrigger | undefined;
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
