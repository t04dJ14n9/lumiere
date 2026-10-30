import { renderablePageColors } from "../shared/page-colors-engine";

let effective: "normal" | "dark" = "normal";
const listeners = new Set<() => void>();

/** Host-posted effective mode after fail-closed engine gating. */
export function currentPageColors(): "normal" | "dark" {
  return effective;
}

/** Apply host effective mode; missing EmbedPDF hook fails closed to Normal. */
export function rememberPageColors(
  value: "normal" | "dark",
): "normal" | "dark" {
  effective = renderablePageColors(value);
  applyOverlayTokens(effective);
  for (const listener of listeners) {
    listener();
  }
  return effective;
}

export function onPageColorsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Contrast-aware overlay tokens for white vs dark paper. */
function applyOverlayTokens(mode: "normal" | "dark"): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.dataset.pageColors = mode;
}
