/**
 * The window's layout and look, which the server keeps between launches:
 * the window's own storage does not last, since its origin's port changes
 * every launch. Pure: the server and the window both import it.
 */

/** VS Code's choice: follow the system, or always light, or always dark. */
export type ColorTheme = "system" | "light" | "dark";

export interface UiState {
  /** The files sidebar on the left. */
  readonly sidebar: boolean;
  /** The outline panel on the right. */
  readonly outline: boolean;
  readonly theme: ColorTheme;
}

export const DEFAULT_UI_STATE: UiState = {
  sidebar: true,
  outline: true,
  theme: "system",
};

const THEMES: readonly ColorTheme[] = ["system", "light", "dark"];

/** The known fields of `value` that have the right type; anything else is dropped. */
export function parseUiChange(value: unknown): Partial<UiState> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const input = value as Record<string, unknown>;
  return {
    ...(typeof input.sidebar === "boolean" ? { sidebar: input.sidebar } : {}),
    ...(typeof input.outline === "boolean" ? { outline: input.outline } : {}),
    ...(THEMES.includes(input.theme as ColorTheme)
      ? { theme: input.theme as ColorTheme }
      : {}),
  };
}

/** A saved state, completed with the defaults; a damaged one reads as the defaults. */
export function readUiState(value: unknown): UiState {
  return { ...DEFAULT_UI_STATE, ...parseUiChange(value) };
}
