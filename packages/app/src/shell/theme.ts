/**
 * The app's own light and dark themes, as Lumière palettes. The shell
 * styles itself with the same `--vscode-*` variables it sends each editor
 * page, so the chrome and the notes always match.
 */
import type { ThemeMessage } from "@workshop/host-node/embedding";
import {
  themeMessage,
  vscodeVariables,
  type Palette,
} from "@workshop/host-node/palette";

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

const system = () => matchMedia("(prefers-color-scheme: dark)");

/** The theme for the system's light or dark setting. */
export function currentPalette(): Palette {
  return system().matches ? DARK : LIGHT;
}

export function currentThemeMessage(): ThemeMessage {
  return themeMessage(currentPalette());
}

/** Style the shell itself with the palette's variables. */
export function applyShellTheme(): void {
  const palette = currentPalette();
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vscodeVariables(palette))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = palette.dark ? "dark" : "light";
}

export function onThemeChange(listener: () => void): () => void {
  const query = system();
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
