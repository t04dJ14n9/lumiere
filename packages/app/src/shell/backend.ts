/**
 * What the window asks of the host it shows: vaults and files, opening,
 * trust, events, its layout, the settings, the tree views, and editor pages.
 * On the desktop and in a browser that is a Lumière server over HTTP
 * (http-backend.ts); in the web and iPad apps it is host-web in the same
 * window (packages/app/src/local). The window does not know which.
 */
import type { SettingChange, SettingItem } from "@workshop/host-node/settings";
import type { TreeEvent, TreeSnapshot } from "@workshop/host-node/views";
import type { UiState } from "../shared/ui-state";
import type { FileEntry, ServerEvent, TrustQuestion, VaultList } from "./api";

export interface WindowBackend {
  readonly vaults: {
    list(): Promise<VaultList>;
    add(path: string): Promise<unknown>;
    files(vault: string): Promise<readonly FileEntry[]>;
    /** A note or folder from outside the window (a menu, a dropped path). */
    open(path: string): Promise<unknown>;
  };
  readonly trust: {
    questions(): Promise<readonly TrustQuestion[]>;
    decide(vault: string, allowed: boolean): Promise<unknown>;
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
    open(vault: string, path: string): Promise<OpenedEditor>;
  };
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
