/** Keep the page's `--vscode-*` variables in step with DSH's theme. */
import { vscodeVariables, type DshTheme } from "./theme";

/** The element DSH defines its tokens on: its body, when the frame may read it. */
function dshThemeHolder(): HTMLElement | undefined {
  try {
    return window.parent !== window ? window.parent.document.body : undefined;
  } catch {
    // A page DSH did not frame (or another origin) cannot read DSH's theme.
    return undefined;
  }
}

function readTheme(holder: HTMLElement | undefined): DshTheme {
  const style = holder ? getComputedStyle(holder) : undefined;
  const dark = holder
    ? holder.hasAttribute("data-ds-dark-theme")
    : matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    token: (name) =>
      style?.getPropertyValue(`--dsw-alias-${name}`).trim() ?? "",
    dark,
    fontFamily: style?.fontFamily || "system-ui, sans-serif",
  };
}

function apply(holder: HTMLElement | undefined): void {
  const theme = readTheme(holder);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vscodeVariables(theme))) {
    root.style.setProperty(name, value);
  }
  // VS Code marks the theme kind on the body; Lumière's styles select on it.
  const kind = theme.dark ? "vscode-dark" : "vscode-light";
  const body = document.body;
  body.classList.remove("vscode-dark", "vscode-light");
  body.classList.add(kind);
  body.dataset.vscodeThemeKind = kind;
  root.style.colorScheme = theme.dark ? "dark" : "light";
}

export function followTheme(): void {
  const holder = dshThemeHolder();
  const update = () => apply(holder);
  if (document.body) {
    update();
  } else {
    document.addEventListener("DOMContentLoaded", update, { once: true });
  }
  if (holder) {
    // DSH switches themes by attributes and inline styles on its body and root.
    const observer = new MutationObserver(update);
    observer.observe(holder, { attributes: true });
    observer.observe(holder.ownerDocument.documentElement, {
      attributes: true,
    });
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
}
