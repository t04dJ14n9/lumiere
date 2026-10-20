import { EditorView } from "@codemirror/view";

/** Clicks on a Sources block. Show-all only reveals rows already in the markup. */
export function bindSources(
  root: ParentNode,
  signal: AbortSignal,
  open: (resource: string) => void,
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-open]",
  )) {
    listen(button, signal, () => open(button.dataset.sourceValue ?? ""));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-more]",
  )) {
    listen(button, signal, () => showAll(button));
  }
}

function listen(
  button: HTMLButtonElement,
  signal: AbortSignal,
  run: () => void,
): void {
  if (button.dataset.sourceBound) {
    return;
  }
  button.dataset.sourceBound = "1";
  button.addEventListener("click", run, { signal });
}

function showAll(button: HTMLButtonElement): void {
  // Resolve the view before detaching the button.
  const view = EditorView.findFromDOM(button);
  const block = button.closest("[data-source-rows]");
  block?.querySelectorAll<HTMLElement>("[data-source-extra]").forEach((row) => {
    row.hidden = false;
  });
  button.remove();
  // Expanding rows grows the properties block widget. Without a measure the
  // height map keeps the pre-expand size, so body lines below the sheet sit
  // under empty reserved space (blank body) or jump when the sheet later
  // leaves the viewport and falls back to estimatedHeight.
  view?.requestMeasure();
}
