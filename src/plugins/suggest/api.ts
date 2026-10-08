import type { EditorState } from "@codemirror/state";
import type { Disposer } from "../../kernel";
import type { Query } from "./protocol";
export interface SuggestionContext {
  state: EditorState;
  pos: number;
}
export interface SuggestionTrigger extends Query {
  from: number;
  closeLink: boolean;
}
export type SuggestionSource = (
  context: SuggestionContext,
) => SuggestionTrigger | undefined;
export interface Suggest {
  register(source: SuggestionSource): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    suggest: Suggest;
  }
  interface Events {
    /** @mode bail */ "suggest/trigger": SuggestionSource;
  }
}
