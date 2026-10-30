import type { Disposer } from "@workshop/core";
import type { EditorProvider } from "../editor-provider";
import type { Endpoint, Transport } from "../rpc/endpoint";
import type { HostDocument } from "./documents";

/** One editor panel as the VS Code adapter hands it to the editor host. */
export interface PanelShell {
  /** VS Code's view column; undefined while the panel is in no editor group. */
  readonly column: number | undefined;
  readonly id: string;
  readonly document: HostDocument;
  readonly transport: Transport;
  readonly cspSource: string;
  readonly trusted: boolean;
  /** A native source selection was present while this panel was opened. */
  readonly openedFromNativeSelection?: boolean;
  /**
   * Search match already known when the panel resolved, so the webview's
   * first paint can show it instead of the top of the note.
   */
  readonly openingSelection?: {
    readonly anchor: number;
    readonly head: number;
  };
  active(): boolean;
  reveal(): void;
  dispose(): void;
  setHTML(html: string): void;
  asset(relative: string): string;
  resource(uri: string): string;
  onDispose(listener: () => void): Disposer;
  onState(listener: () => void): Disposer;
  /** Report the editor's current selection offsets to VS Code's CustomTextEditorNavigation. */
  reportSelection?(selection: { anchor: number; head: number }): void;
  /** Bind view state capture/restore handlers for VS Code's CustomTextEditorNavigation. */
  bindViewState?(handlers: {
    capture(): Promise<unknown>;
    restore(state: unknown): Promise<void>;
  }): Disposer;
}

/** An open editor panel, as other host code sees it. */
export interface PanelPort {
  /** VS Code's view column; undefined while the panel is in no editor group. */
  readonly column: number | undefined;
  readonly id: string;
  readonly document: HostDocument;
  readonly openedFromNativeSelection?: boolean;
  readonly rpc: Endpoint;
  active(): boolean;
  reveal(): void;
  /** Close the panel; resolves once its kernel and resources have stopped. */
  dispose(): Promise<void>;
}

/**
 * Handlers for reclaiming Explorer drop-without-Shift media tabs as
 * attachments. Implemented by the attachments host; wired only where the
 * adapter has `tabGroups` (VS Code).
 */
export interface ExplorerAttachmentReclaimHandlers {
  reclaim(args: {
    resourceUri: string;
    column: number;
    lumiereUri: string;
  }): Promise<void>;
}

/** VS Code's custom editor registry. */
export interface CustomEditors {
  /** Register an editor (see `EditorProvider`); its panels go to `open`. */
  register(
    provider: EditorProvider,
    open: (panel: PanelShell) => void,
  ): Disposer;
  /**
   * VS Code only: watch Explorer open-on-drop pinned media tabs and turn them
   * into attachments. Portable hosts omit this.
   */
  registerExplorerAttachmentReclaim?(
    handlers: ExplorerAttachmentReclaimHandlers,
  ): Disposer;
}
