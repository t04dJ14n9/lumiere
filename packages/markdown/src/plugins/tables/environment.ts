import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { InputGrouping } from "../document/api";
import type { MenuItem } from "../editor/api";
import type { VimService } from "../vim/api";
import type { LinksService } from "../links/api";
import type { TableWheelEvent } from "./wheel-scroll";
export type Action =
  | "save"
  | "undo"
  | "redo"
  | "close"
  | "saveClose"
  | "openAsText"
  | "toggleTextEditor";
/** Services captured by one table plugin instance, shared with its cell views. */
export interface TableEnvironment {
  language: Extension;
  vim?: VimService;
  links?: LinksService;
  inputGroups(): InputGrouping;
  renderContent(element: HTMLElement, source: string, offset: number): void;
  disposeContent(element: HTMLElement): void;
  position(
    source: string,
    element: HTMLElement,
    point: { clientX: number; clientY: number },
  ): number | undefined;
  wrap(marker: string, view: EditorView): boolean;
  canFormat: boolean;
  clearFormatting(source: string): string;
  openMenu(
    owner: HTMLElement,
    items: readonly MenuItem[],
    point: { x: number; y: number },
    report: (message: string) => void,
  ): () => void;
  copy(text: string): void;
  paste(): Promise<string>;
  /** Record vertical widget input and report whether the note can scroll farther. */
  scrollNote(distance: number, event: TableWheelEvent): boolean;
}
