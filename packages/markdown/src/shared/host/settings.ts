import type { Disposer, Infer } from "@workshop/core";
import type { Configuration } from "../configuration";
import type { featureSettings } from "../features";
import type { HostDocument } from "./documents";

/** The settings that apply to one note (they are resource-scoped). */
export interface NoteSettings {
  debugLogging?: boolean;
  features?: Infer<typeof featureSettings>;
  editor?: {
    useTabs: boolean;
    tabSize: number;
    readableLineLength?: boolean;
    strictLineBreaks?: boolean;
    rightToLeft?: boolean;
    dragScrollSpeed?: number;
    defaultMode?: "livePreview" | "source";
    /** The note's own body size in pixels and line height multiplier. */
    fontSize?: number;
    lineHeight?: number;
    /** VS Code's editor font settings as they apply to Markdown files. */
    fontFamily?: string;
    fontWeight?: string;
    letterSpacing?: number;
    fontLigatures?: boolean | string;
    fontVariations?: boolean | string;
    /** Native caret presentation settings, also resource-scoped to Markdown. */
    cursorStyle?:
      | "line"
      | "block"
      | "underline"
      | "line-thin"
      | "block-outline"
      | "underline-thin";
    cursorBlinking?: "blink" | "smooth" | "phase" | "expand" | "solid";
    cursorSmoothCaretAnimation?: "off" | "explicit" | "on";
    cursorWidth?: number;
  };
  preset: "minimal" | "obsidian";
  mode: "source" | "livePreview";
}

/** Where a setting is stored: the folder, the workspace or the user's settings. */
export type SettingTarget = "workspaceFolder" | "workspace" | "user";

/** One setting of the extension's `contributes.configuration`, as VS Code lists it. */
export interface ContributedSetting {
  /** The full key, such as `lumiere.markdown.editor.fontSize`. */
  key: string;
  schema: {
    type?: string | readonly string[];
    enum?: readonly unknown[];
    enumDescriptions?: readonly string[];
    minimum?: number;
    maximum?: number;
    default?: unknown;
    description?: string;
    markdownDescription?: string;
  };
}

/** The Settings UI's own keys and scopes, for commands that change settings. */
export interface SettingsAccess {
  /** A `lumiere.markdown.` key as it is now, and where a write to it goes. */
  inspect(
    key: string,
    resource?: string,
  ): { value: unknown; target: SettingTarget };
  /** Writes the key where `inspect` says (the workspace if it sets it, else the user's settings). */
  update(
    key: string,
    value: unknown,
    resource?: string,
  ): Promise<SettingTarget>;
  /** The extension's contributed settings, straight from its package.json. */
  contributed(): readonly ContributedSetting[];
  /** The Settings UI search for this extension's settings: `@ext:publisher.name`. */
  readonly searchFilter: string;
  /** Opens the Settings UI with a search such as `searchFilter`. */
  openUi(query: string): Promise<void>;
}

/**
 * The workspace's own `workbench.editorAssociations`, not the user's or a
 * folder's. `read()` is undefined when no workspace is open.
 */
export interface EditorAssociations {
  read(): unknown;
  write(associations: Readonly<Record<string, string>>): Promise<void>;
}

/** `lumiere.markdown.*` settings: reading, watching and changing them. */
export interface HostSettings {
  /** A window-level setting under `lumiere.markdown.`. */
  get<T>(key: string, fallback: T, resource?: string): T;
  /** The settings that apply to a note. */
  forNote(document: HostDocument): NoteSettings;
  onChange(listener: () => void): Disposer;
  /** Effective resource settings, including disposable feature overrides. */
  readonly effective: Configuration;
  /** Reading and writing settings like the Settings UI does. */
  readonly access: SettingsAccess;
  readonly editorAssociations: EditorAssociations;
}
