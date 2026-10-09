import type { RuntimePluginState } from "../../shared/plugin-state";
import type { config as editorConfig } from "./manifest";
import type { Cancellation } from "../../shared/rpc/lifecycle";
import type { ViewStateContributions } from "./contributions";
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
  readonly settings: Infer<typeof editorConfig>;
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
  focus(): void;
}
export interface EditorPanel extends PanelPort {
  readonly session: DocumentSession;
  readonly ready?: Promise<void>;
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
declare module "../../kernel/types" {
  interface Services {
    editor: EditorService;
    menu: Menu;
    editors: Editors;
  }
  interface Events {
    /** @mode pipeline */ "editor/selectionMenu": (
      items: readonly MenuItem[],
    ) => readonly MenuItem[] | Promise<readonly MenuItem[]>;
    /** @mode emit */ "editor/clearProjection": () => void;
    /** @mode bail */ "editor/activeView": () => EditorView | undefined;
    /** @mode bail */ "editor/projectSelection": () =>
      | { from: number; to: number }
      | undefined;
    /** @mode emit */ "editor/modeRestored": (
      mode: "source" | "livePreview",
    ) => void;
    /** @mode emit */ "editor/configure": () => void;
    /** @mode emit */ "editor/pluginsChanged": (panel: PanelPort) => void;
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
declare module "../../kernel/types" {
  interface Services {
    selections: Selections;
  }
}
