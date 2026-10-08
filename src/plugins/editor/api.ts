import type { Infer } from "../../kernel";
import type { viewState } from "./protocol";
import type { DocumentSession } from "../document/api";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Disposer } from "../../kernel";
import type { PanelPort } from "../../shared/runtime";
export interface MenuItem {
  label: string;
  run?: () => void | Promise<void>;
  children?: readonly MenuItem[];
  disabled?: boolean;
}
export interface Menu {
  open(
    owner: EditorView["dom"],
    items: readonly MenuItem[],
    point: { x: number; y: number },
    label?: string,
  ): Disposer;
}
export interface EditorService {
  readonly clipboard: {
    read(): Promise<string>;
    write(text: string): Promise<void>;
  };
  mode: "source" | "livePreview";
  readonly folds: Map<string, boolean>;
  readonly view: EditorView;
  extend(
    extension: Extension,
    options?: { slot?: "override" | "suggest" | "keymap" | "base" },
  ): Disposer;
  focus(): void;
}
export interface EditorPanel extends PanelPort {
  readonly session: DocumentSession;
}
export interface ViewSnapshot {
  readonly editorId: string;
  readonly documentUri: string;
  readonly documentVersion: number;
  readonly state: Infer<typeof viewState>;
}
export interface Editors {
  capture(editorId: string): Promise<ViewSnapshot>;
  restore(editorId: string, snapshot: ViewSnapshot): Promise<void>;
  all(): readonly EditorPanel[];
  active(): EditorPanel | undefined;
}
declare module "../../kernel/types" {
  interface Services {
    editor: EditorService;
    menu: Menu;
    editors: Editors;
  }
  interface Events {
    /** @mode emit */ "editor/modeRestored": (
      mode: "source" | "livePreview",
    ) => void;
    /** @mode emit */ "editor/opened": (panel: PanelPort) => void;
    /** @mode emit */ "editor/closed": (panel: PanelPort) => void;
    /** @mode emit */ "editor/activeChanged": (
      panel: PanelPort | undefined,
    ) => void;
    /** @mode emit */ "editor/selectionChanged": (
      panel: PanelPort,
      hasSelection: boolean,
    ) => void;
  }
}
