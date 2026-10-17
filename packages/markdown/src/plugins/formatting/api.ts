import type { EditorView } from "@codemirror/view";
export interface Formatting {
  wrap(marker: string, view: EditorView): boolean;
  clear(source: string): string;
}
declare module "@workshop/core" {
  interface Services {
    formatting: Formatting;
  }
}
