import type { Disposer } from "../../kernel";
import type { SourceSelection } from "./api";
import type { Cancellation } from "../../shared/rpc/lifecycle";
export interface EditorAction {
  id: string;
  label: string;
  scope: "selection" | "title";
  isAvailable?(editorId: string): boolean;
  run(
    context: { editorId: string; selection?: SourceSelection },
    token: Cancellation,
  ): void | Promise<void>;
}
export interface EditorActions {
  register(action: EditorAction): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    editorActions: EditorActions;
  }
}
