import { EditorView } from "@codemirror/view";

export type BindSourcesOptions = {
  /** Remember that the user disclosed every Sources row (for remount / estimate). */
  onExpand?(): void;
};

/** Clicks on a Sources block. Show-all remounts via onExpand (preview → full). */
export function bindSources(
  root: ParentNode,
  signal: AbortSignal,
  open: (resource: string) => void,
  options: BindSourcesOptions = {},
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-open]",
  )) {
    listen(button, signal, () => open(button.dataset.sourceValue ?? ""));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-more]",
  )) {
    listen(button, signal, () => showAll(button, options.onExpand));
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

function showAll(
  button: HTMLButtonElement,
  onExpand: BindSourcesOptions["onExpand"],
): void {
  // Resolve the view before detaching the button / remounting the sheet.
  const view = EditorView.findFromDOM(button);
  const block = button.closest("[data-source-rows]");
  // Legacy path: older markup kept extras hidden in-DOM. Prefer remount.
  block?.querySelectorAll<HTMLElement>("[data-source-extra]").forEach((row) => {
    row.hidden = false;
  });
  button.remove();
  onExpand?.();
  // Expanding rows grows the properties block widget. Without a measure the
  // height map keeps the pre-expand size. After expand, remounts must also
  // reserve the full sheet (see renderSources({ expanded: true })).
  view?.requestMeasure();
}
