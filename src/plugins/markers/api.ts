import type { Disposer } from "@workshop/core";
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
declare module "@workshop/core" {
  interface Services {
    markers: Markers;
  }
}
