/**
 * The page's `--vscode-*` variables, which VS Code would set on a webview.
 * The embedder (DSH's preview plugin, the app shell) sends them in a theme
 * message whenever its theme changes; until one arrives the page follows
 * the system's light or dark setting with the editor's own fallbacks.
 */
import type { ThemeMessage } from "../embedding";

export function applyTheme(
  theme: Pick<ThemeMessage, "dark" | "variables">,
): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.variables)) {
    root.style.setProperty(name, value);
  }
  setKind(theme.dark);
}

/** Before the embedder speaks: the system's light or dark, no variables. */
export function followSystemTheme(): () => void {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const update = () => setKind(query.matches);
  whenBodyExists(update);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}

/** VS Code marks the theme kind on the body; Lumière's styles select on it. */
function setKind(dark: boolean): void {
  whenBodyExists(() => {
    const kind = dark ? "vscode-dark" : "vscode-light";
    document.body.classList.remove("vscode-dark", "vscode-light");
    document.body.classList.add(kind);
    document.body.dataset.vscodeThemeKind = kind;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  });
}

function whenBodyExists(run: () => void): void {
  if (document.body) {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  }
}
