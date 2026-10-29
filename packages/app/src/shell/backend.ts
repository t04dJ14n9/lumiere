/**
 * What the window asks of the host it shows: vaults and files, opening,
 * trust, events, its layout, the settings, the tree views, and editor pages.
 * On the desktop and in a browser that is a Lumière server over HTTP
 * (http-backend.ts); in the web and iPad apps it is host-web in the same
 * window (packages/app/src/local). The window does not know which.
 */
import type { SettingChange, SettingItem } from "@workshop/host-node/settings";
import type { TreeEvent, TreeSnapshot } from "@workshop/host-node/views";
import type { FileKind } from "../shared/file-kind";
import type { UiState } from "../shared/ui-state";
import type { FileEntry, PaletteCommand, ServerEvent, VaultList } from "./api";
import { MENU_COMMANDS, type MenuCommand } from "./tauri";

/**
 * A command from the app's own menus: one of the window's (tauri.ts), or
 * `page-menu`, the shown note's right-click menu at its selection, for a
 * device without a right click (More… in the iPad's edit menu).
 */
export type AppCommand = MenuCommand | "page-menu";

/** The command a native menu sent, if it is one the window knows. */
export function parseAppCommand(value: unknown): AppCommand | undefined {
  return value === "page-menu" ||
    (MENU_COMMANDS as readonly unknown[]).includes(value)
    ? (value as AppCommand)
    : undefined;
}

export interface WindowBackend {
  readonly vaults: {
    list(): Promise<VaultList>;
    add(path: string): Promise<unknown>;
    close(path: string): Promise<unknown>;
    files(vault: string): Promise<readonly FileEntry[]>;
    /** A note or folder from outside the window (a menu, a dropped path). */
    open(path: string): Promise<unknown>;
  };
  readonly commands?: {
    list(): Promise<readonly PaletteCommand[]>;
    run(command: string): Promise<unknown>;
  };
  events(listener: (event: ServerEvent) => void): () => void;
  readonly ui: {
    load(): Promise<UiState>;
    save(change: Partial<UiState>): Promise<UiState>;
  };
  readonly settings: {
    list(): Promise<readonly SettingItem[]>;
    /** The changed setting, or an error that says why the value was refused. */
    change(change: SettingChange): Promise<SettingItem>;
  };
  readonly views: {
    /** The tree now; undefined while its plugin has not registered it. */
    snapshot(viewId: string): Promise<TreeSnapshot | undefined>;
    run(viewId: string, id: string): Promise<void>;
    setVisible(viewId: string, visible: boolean): Promise<void>;
    events(listener: (event: TreeEvent) => void): () => void;
  };
  readonly editors: {
    /** The kinds of file it opens in a tab; notes when not given. */
    readonly kinds?: readonly FileKind[];
    open(vault: string, path: string): Promise<OpenedEditor>;
  };
  /**
   * The commands chosen in the app's own menus and keys, where the app hands
   * them over this way (the iPad's menu bar and edit menu); the desktop
   * app's come through Tauri (tauri.ts).
   */
  readonly appCommands?: (
    listener: (command: AppCommand) => void,
  ) => () => void;
  /** A folder picker the window can show, when it has one; the vault's path. */
  readonly pickFolder?: () => Promise<string | undefined>;
  /**
   * Whether the reader may type a folder's path (a browser on a server,
   * which has no picker that gives one); never where paths mean nothing.
   */
  readonly typesPaths?: boolean;
}

/** A file's page, for a tab's iframe. */
export interface OpenedEditor {
  readonly url: string;
  /**
   * The channel to the page's host, when it has no server to connect to:
   * the window hands it over when the page asks (embedding.ts).
   */
  connect?(): MessagePort;
  /** The tab closed. */
  dispose(): void;
}

let current: WindowBackend | undefined;

/** The window's backend, chosen once, before the window renders (main.tsx). */
export function installBackend(backend: WindowBackend): void {
  current = backend;
}

export function backend(): WindowBackend {
  if (!current) {
    throw new Error("The window has no backend yet");
  }
  return current;
}
