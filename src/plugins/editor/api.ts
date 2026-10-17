import type { RuntimePluginState } from "../../shared/plugin-state";
import type { config as editorConfig } from "./manifest";
import type { Cancellation } from "../../shared/rpc/lifecycle";
import type { ViewStateContributions } from "./contributions";
import type { Infer, Disposer } from "@workshop/core";
import type { viewState } from "./protocol";
import type { DocumentSession } from "../document/api";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { PanelPort } from "../../shared/runtime";
import type { CaretMode } from "./caret";
export type { CaretMode } from "./caret";
export interface CaretModeSource {
  mode(view: EditorView): CaretMode;
  watch?(view: EditorView, refresh: () => void): () => void;
}
export interface MenuItem {
  label: string;
  run?: () => void | Promise<void>;
  children?: readonly MenuItem[];
  disabled?: boolean;
  checked?: boolean;
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
  readonly settings: Infer<typeof editorConfig>;
  /** Own a modal caret source through the same extension registration as its keys. */
  caret(source: CaretModeSource): Extension;
  readonly clipboard: {
    read(): Promise<string>;
    write(text: string): Promise<void>;
  };
  mode: "source" | "livePreview";
  readonly source: string;
  readonly viewState: ViewStateContributions;
  readonly view: EditorView;
  extend(
    extension: Extension,
    options?: {
      slot?: "override" | "suggest" | "keymap" | "base";
      owner?: string;
    },
  ): Disposer;
  /** Record a deliberate jump, excluding ordinary editing and cursor motion. */
  navigate<T>(jump: () => T): T;
  onNavigate(capture: () => () => void): Disposer;
  settled(): Promise<boolean>;
  focus(): void;
}
export interface EditorPanel extends PanelPort {
  readonly session: DocumentSession;
  readonly ready?: Promise<void>;
  readonly webviewGeneration?: number;
  webviewPluginStates?(): readonly RuntimePluginState[];
  pluginStates?(): readonly RuntimePluginState[];
  refreshPlugins?(): Promise<void>;
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
declare module "@workshop/core" {
  interface Services {
    editor: EditorService;
    menu: Menu;
    editors: Editors;
  }
  interface Events {
    /** Widget-handled user scroll input, including ticks chained at an edge. @mode emit */
    "editor/scrollInput": (view: EditorView) => void;
    /** @mode pipeline */ "editor/selectionMenu": (
      items: readonly MenuItem[],
    ) => readonly MenuItem[] | Promise<readonly MenuItem[]>;
    /** @mode emit */ "editor/clearProjection": () => void;
    /** @mode bail */ "editor/activeView": () => EditorView | undefined;
    /** @mode bail */ "editor/projectSelection": () =>
      { from: number; to: number } | undefined;
    /** @mode emit */ "editor/modeRestored": (
      mode: "source" | "livePreview",
    ) => void;
    /** @mode emit */ "editor/configure": () => void;
    /** @mode emit */ "editor/pluginsChanged": (panel: PanelPort) => void;
    /** @mode emit */ "editor/loading": () => void;
    /** @mode emit */ "editor/ready": (panel: PanelPort) => void;
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

export interface SourceSelection {
  readonly id: string;
  readonly editorId: string;
  readonly documentId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly sourceSha256?: string;
  readonly from: number;
  readonly to: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}
export interface Selections {
  capture(
    editorId: string,
    token?: Cancellation,
  ): Promise<SourceSelection | undefined>;
  validate(selection: SourceSelection): EditorPanel;
}
declare module "@workshop/core" {
  interface Services {
    selections: Selections;
  }
}
