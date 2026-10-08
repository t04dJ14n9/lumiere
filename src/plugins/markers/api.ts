import type { Disposer } from "../../kernel";
export interface SourceMarker {
  id: string;
  from: number;
  to: number;
  documentVersion: number;
  label: string;
  tooltip?: string;
  actionId?: string;
}
export interface Markers {
  set(editorId: string, markers: readonly SourceMarker[]): void;
  clear(editorId: string): void;
  registerAction(
    id: string,
    run: (context: {
      editorId: string;
      marker: Readonly<SourceMarker>;
    }) => void | Promise<void>,
  ): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    markers: Markers;
  }
}
