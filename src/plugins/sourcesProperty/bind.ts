/** Clicks on a read-only Sources block. Show-all only reveals rows already in the markup. */
export function bindSources(
  root: ParentNode,
  signal: AbortSignal,
  open: (resource: string) => void,
  copy: (text: string) => void,
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-open]",
  )) {
    listen(button, signal, () => open(button.dataset.sourceValue ?? ""));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-source-copy]",
  )) {
    listen(button, signal, () => copy(button.dataset.sourceValue ?? ""));
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
  const block = button.closest("[data-source-rows]");
  block?.querySelectorAll<HTMLElement>("[data-source-extra]").forEach((row) => {
    row.hidden = false;
  });
  button.remove();
}
