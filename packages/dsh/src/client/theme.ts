/**
 * DSH's theme as Lumière's palette (host-node/src/palette.ts), from the
 * tokens DSH sets on its body (`--dsw-alias-*`, measured on DSH 0.2.1). The
 * preview plugin sends it to each page, so a note follows DSH's light and
 * dark themes.
 */
import type { ThemeMessage } from "@workshop/host-node/embedding";
import { themeMessage, type Palette } from "@workshop/host-node/palette";

/** DSH's token (after `--dsw-alias-`) for each palette role. */
export function dshPalette(
  token: (name: string) => string,
  dark: boolean,
  fontFamily: string,
): Palette {
  return {
    dark,
    fontFamily,
    background: token("bg-base"),
    surface: token("bg-layer-2"),
    field: token("bg-layer-1"),
    foreground: token("label-primary"),
    muted: token("label-secondary"),
    faint: token("label-tertiary"),
    border: token("border-l2"),
    accent: token("link"),
    hover: token("interactive-bg-hover"),
    active: token("interactive-bg-active"),
    selection: token("bg-document-selection"),
    button: token("button-primary-fill"),
    buttonForeground: token("label-primary-inverted"),
    buttonHover: token("button-primary-hover"),
    error: token("state-error-primary"),
    warning: token("state-warn-primary"),
    success: token("state-success-primary"),
  };
}

/** DSH's current theme as a theme message. */
export function readDshTheme(): ThemeMessage {
  const style = getComputedStyle(document.body);
  return themeMessage(
    dshPalette(
      (name) => style.getPropertyValue(`--dsw-alias-${name}`).trim(),
      document.body.hasAttribute("data-ds-dark-theme"),
      style.fontFamily || "system-ui, sans-serif",
    ),
  );
}

/** Call `listener` whenever DSH switches theme (attributes on its body and root). */
export function onDshThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true });
  observer.observe(document.documentElement, { attributes: true });
  const system = matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", listener);
  return () => {
    observer.disconnect();
    system.removeEventListener("change", listener);
  };
}
