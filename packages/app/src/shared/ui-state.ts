/**
 * The window's layout and look, which the server keeps between launches:
 * the window's own storage does not last, since its origin's port changes
 * every launch. Pure: the server and the window both import it.
 */

/** VS Code's choice: follow the system, or always light, or always dark. */
export type ColorTheme = "system" | "light" | "dark";

/** Vault → the file list's open folders, by vault-relative path. */
export type SavedFolders = Readonly<Record<string, readonly string[]>>;

export interface UiState {
  /** The files sidebar on the left. */
  readonly sidebar: boolean;
  /** The outline panel on the right. */
  readonly outline: boolean;
  readonly theme: ColorTheme;
  /** The folders open in each vault's file list; the others are closed. */
  readonly folders: SavedFolders;
}

export const DEFAULT_UI_STATE: UiState = {
  sidebar: true,
  outline: true,
  theme: "system",
  folders: {},
};

const THEMES: readonly ColorTheme[] = ["system", "light", "dark"];

/** The known fields of `input` that have the right type; anything else is dropped. */
export function parseUiChange(input: unknown): Partial<UiState> {
  if (!isRecord(input)) {
    return {};
  }
  return {
    ...(typeof input.sidebar === "boolean" ? { sidebar: input.sidebar } : {}),
    ...(typeof input.outline === "boolean" ? { outline: input.outline } : {}),
    ...(THEMES.includes(input.theme as ColorTheme)
      ? { theme: input.theme as ColorTheme }
      : {}),
    ...(isRecord(input.folders)
      ? { folders: parseFolders(input.folders) }
      : {}),
  };
}

/** Each vault's list of folder paths; what is not a list, or not a path in one, is dropped. */
function parseFolders(value: Record<string, unknown>): SavedFolders {
  return Object.fromEntries(
    Object.entries(value).flatMap(([vault, paths]) =>
      Array.isArray(paths)
        ? [[vault, paths.filter((path) => typeof path === "string")]]
        : [],
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A saved state, completed with the defaults; a damaged one reads as the defaults. */
export function readUiState(value: unknown): UiState {
  return { ...DEFAULT_UI_STATE, ...parseUiChange(value) };
}
