import { placePropertyRows } from "./rows";
import { frontmatter } from "../../markdown/properties";
import { renderProperties } from "./sheet-html";
import type { PropertyContext } from "./context";
import { sanitize } from "./sanitize";
import { bindPropertyFields } from "./fields";
import { bindPropertyLists } from "./lists";
import { bindPropertyControls } from "./controls";

const renderedRows = new WeakMap<HTMLElement, string>();

export function rememberPropertyRows(container: HTMLElement): void {
  for (const row of container.querySelectorAll<HTMLElement>(
    "[data-property-row]",
  )) {
    renderedRows.set(row, row.outerHTML);
  }
}

/** Keep the actual active input connected, including during composition. */
export function reconcileProperties(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): boolean {
  const panel = container.querySelector<HTMLDetailsElement>(
    ":scope > .properties",
  );
  const header = frontmatter(source);
  if (!panel || !header?.values) {
    return false;
  }
  const fresh = document.createElement("div");
  fresh.innerHTML = sanitize(
    renderProperties(
      source,
      context.propertyEditor?.types?.(),
      context.propertyEditor?.forcedTypes?.(),
    ),
  );
  const nextRows = [
    ...fresh.querySelectorAll<HTMLElement>("[data-property-row]"),
  ];
  const list = panel.querySelector("dl")!;
  const active = panel.contains(document.activeElement)
    ? document.activeElement
    : null;
  const activeRow = active?.closest<HTMLElement>("[data-property-row]");
  const nextActiveRow = nextRows.find(
    (row) => row.dataset.propertyRow === activeRow?.dataset.propertyRow,
  );
  const keep =
    activeRow && nextActiveRow && keepInput(active, nextActiveRow)
      ? activeRow
      : undefined;

  const rows = reconcileRows({ list, nextRows, keep, active });
  placePropertyRows(list, rows, keep);
  panel.querySelector(".property-count")!.textContent = String(nextRows.length);
  bindPropertyFields(container, source, context);
  bindPropertyLists(container, source, context);
  bindPropertyControls(container, source, context);

  restoreReplacedFocus(active, activeRow, rows);
  return true;
}

function keepInput(active: Element | null, row: HTMLElement): boolean {
  if (
    !(active instanceof HTMLInputElement) ||
    active.dataset.propertyCommitting
  ) {
    return false;
  }
  if (active.hasAttribute("data-property-name")) {
    return true;
  }
  if (active.hasAttribute("data-property-input")) {
    if (!active.dataset.propertyEditing) {
      return false;
    }
    const replacement = row.querySelector<HTMLInputElement>(
      "[data-property-input]",
    );
    return (
      replacement?.dataset.propertyKind === active.dataset.propertyKind ||
      active.value !== active.defaultValue
    );
  }
  return (
    !!active.closest("[data-property-list]") &&
    (!!active.value || !!active.dataset.propertyEditing)
  );
}

function replacementFocus(active: Element, row: HTMLElement): HTMLElement {
  if (
    active instanceof HTMLElement &&
    active.hasAttribute("data-property-chip")
  ) {
    return (
      row.querySelector<HTMLElement>(
        `[data-property-chip="${active.dataset.propertyChip}"]`,
      ) ?? row
    );
  }
  if (active instanceof HTMLInputElement) {
    if (active.hasAttribute("data-property-chip-edit")) {
      return (
        row.querySelector<HTMLElement>(
          `[data-property-chip="${active.dataset.propertyChipEdit}"]`,
        ) ?? row
      );
    }
    if (active.hasAttribute("data-property-name")) {
      return row.querySelector<HTMLInputElement>("[data-property-name]") ?? row;
    }
    if (active.closest("[data-property-list]")) {
      return (
        row.querySelector<HTMLInputElement>("[data-property-list] input") ?? row
      );
    }
  }
  return row;
}

function reconcileRows(options: {
  list: HTMLElement;
  nextRows: HTMLElement[];
  keep: HTMLElement | undefined;
  active: Element | null;
}): HTMLElement[] {
  const { list, nextRows, keep, active } = options;
  const existing = new Map(
    [...list.children].map((row) => [
      (row as HTMLElement).dataset.propertyRow,
      row as HTMLElement,
    ]),
  );
  return nextRows.map((row) => {
    const previous = existing.get(row.dataset.propertyRow);
    const html = row.outerHTML;
    if (keep && previous === keep) {
      if (
        active instanceof HTMLInputElement &&
        active.hasAttribute("data-property-name") &&
        renderedRows.get(keep) !== html
      ) {
        keep.querySelector("dd")!.replaceWith(row.querySelector("dd")!);
        const type = keep.querySelector<HTMLButtonElement>(
          "[data-property-type]",
        )!;
        const nextType = row.querySelector<HTMLButtonElement>(
          "[data-property-type]",
        )!;
        type.innerHTML = nextType.innerHTML;
        type.setAttribute("aria-label", nextType.getAttribute("aria-label")!);
        renderedRows.set(keep, html);
      }
      return keep;
    }
    if (previous && renderedRows.get(previous) === html) {
      return previous;
    }
    renderedRows.set(row, html);
    return row;
  });
}

function restoreReplacedFocus(
  active: Element | null,
  activeRow: HTMLElement | null | undefined,
  rows: HTMLElement[],
): void {
  const updatedActiveRow = rows.find(
    (row) => row.dataset.propertyRow === activeRow?.dataset.propertyRow,
  );
  if (active && !active.isConnected && updatedActiveRow) {
    const target = replacementFocus(active, updatedActiveRow);
    queueMicrotask(() => {
      const focused = document.activeElement;
      if (
        target.isConnected &&
        (focused === document.body || focused?.classList.contains("cm-content"))
      ) {
        target.focus({ preventScroll: true });
      }
    });
  }
}
