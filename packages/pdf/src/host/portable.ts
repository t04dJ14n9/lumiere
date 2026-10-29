/**
 * Lumière PDF's viewer for hosts other than VS Code (`@workshop/pdf/portable`):
 * the viewer core, the contracts a host implements for it, and the settings
 * it opens with. Nothing here may reach `vscode`: this folder's tsconfig maps
 * it to a file that does not compile.
 */
export {
  PdfViewerPanel,
  type ViewerPanelHost,
  type ViewerPanelOptions,
} from "./viewer/panel";
export type { PdfFiles, PdfWebview } from "../shared/host";
export type { HostMessage, PdfDelivery } from "../shared/messages";
export type { ReadingPosition } from "../shared/reading-position";
export {
  DEFAULT_FLOATING_DOCK,
  type ToolbarSettings,
} from "../shared/toolbar-settings";
export {
  DEFAULT_VIEW_CHOICES,
  type ViewSettings,
} from "../shared/view-settings";
