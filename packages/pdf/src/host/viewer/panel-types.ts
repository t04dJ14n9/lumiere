import type { ViewerMessage } from "../../shared/messages";
import type { PdfFiles } from "../../shared/host";
import type { ReadingPosition } from "../../shared/reading-position";
import type { ToolbarSettings } from "../../shared/toolbar-settings";
import type { ViewSettings } from "../../shared/view-settings";

/** Messages the panel leaves to plugins (see `PdfViewerPanels.handle`). */
export type PluginMessage = Extract<
  ViewerMessage,
  {
    type:
      | "copyLinkForAgent"
      | "toggleOutline"
      | "floatingDock"
      | "lookUp"
      | "zen"
      | "historyJump"
      | "historyTraverse";
  }
>;

/** What a panel needs from its host beyond its page. */
export interface ViewerPanelHost {
  readonly files: PdfFiles;
  /** Tell the reader something went wrong (VS Code: an error notification). */
  error(message: string): void;
  /** A web or mail link the reader clicked in the PDF. */
  openExternal(url: string): Promise<void>;
  /**
   * A view action came from outside the viewer (a status bar entry, a title
   * button, a picker), which left the keyboard focus there, where the arrow
   * keys do nothing: give it back to the viewer.
   */
  refocus(): void;
}

export interface ViewerPanelOptions {
  /** The toolbar layout for the first paint. */
  toolbar: ToolbarSettings;
  settings: ViewSettings;
  position: ReadingPosition | undefined;
  savePosition(position: ReadingPosition): void;
  /** Hand a message the panel does not handle itself to the plugin that does. */
  route(message: PluginMessage): Promise<void>;
}
