/**
 * The window's light and dark themes, as Lumière palettes. The window styles
 * itself with the same `--vscode-*` variables it sends each editor page, so
 * the chrome and the notes always match. Which one shows is the reader's
 * Color Theme: the system's, or always light, or always dark.
 */
import type { ThemeMessage } from "@workshop/host-node/embedding";
import {
  themeMessage,
  vscodeVariables,
  type Palette,
} from "@workshop/host-node/palette";
import type { ColorTheme } from "../shared/ui-state";
import { setAppTheme } from "./tauri";

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;

export const LIGHT: Palette = {
  dark: false,
  fontFamily: FONT,
  background: "#ffffff",
  surface: "#f6f7f9",
  field: "#ffffff",
  foreground: "#1f2328",
  muted: "#59636e",
  faint: "#8c959f",
  border: "#d8dee4",
  accent: "#3b6fd6",
  hover: "rgba(31, 35, 40, 0.06)",
  active: "rgba(59, 111, 214, 0.14)",
  selection: "rgba(59, 111, 214, 0.25)",
  button: "#3b6fd6",
  buttonForeground: "#ffffff",
  buttonHover: "#2f5bb5",
  error: "#cf222e",
  warning: "#9a6700",
  success: "#1a7f37",
};

export const DARK: Palette = {
  dark: true,
  fontFamily: FONT,
  background: "#1b1d21",
  surface: "#24272c",
  field: "#1f2226",
  foreground: "#e6e8eb",
  muted: "#a3a9b1",
  faint: "#737a83",
  border: "#363a40",
  accent: "#7aa2ff",
  hover: "rgba(255, 255, 255, 0.06)",
  active: "rgba(122, 162, 255, 0.18)",
  selection: "rgba(122, 162, 255, 0.3)",
  button: "#7aa2ff",
  buttonForeground: "#111317",
  buttonHover: "#93b4ff",
  error: "#f47067",
  warning: "#d4a72c",
  success: "#57ab5a",
};

let preference: ColorTheme = "system";
const listeners = new Set<() => void>();
const system = () => matchMedia("(prefers-color-scheme: dark)");

/** The palette for a Color Theme, given whether the system is dark. */
export function paletteFor(theme: ColorTheme, systemIsDark: boolean): Palette {
  if (theme === "system") {
    return systemIsDark ? DARK : LIGHT;
  }
  return theme === "dark" ? DARK : LIGHT;
}

export function currentPalette(): Palette {
  return paletteFor(preference, system().matches);
}

export function currentThemeMessage(): ThemeMessage {
  return themeMessage(currentPalette());
}

/**
 * The reader chose a Color Theme. In the desktop app the window's title bar
 * and menus follow it too, and with "system" the app goes back to the
 * system's appearance.
 */
export function setColorTheme(theme: ColorTheme): void {
  if (theme === preference) {
    return;
  }
  preference = theme;
  void setAppTheme(theme === "system" ? null : theme);
  notify();
}

/** Style the window itself with the palette's variables. */
export function applyShellTheme(): void {
  const palette = currentPalette();
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vscodeVariables(palette))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = palette.dark ? "dark" : "light";
}

/** The palette changed: the reader's choice, or the system's while following it. */
export function onThemeChange(listener: () => void): () => void {
  const query = system();
  const followSystem = () => {
    if (preference === "system") {
      listener();
    }
  };
  listeners.add(listener);
  query.addEventListener("change", followSystem);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", followSystem);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
