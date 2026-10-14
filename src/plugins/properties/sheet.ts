import { placePropertyRows } from "./rows";
import { frontmatter } from "../../markdown/properties";
import { renderProperties } from "./sheet-html";
import type { PropertyContext } from "./context";
import { sanitize } from "./sanitize";
import { bindPropertyFields } from "./fields";
import { bindPropertyLists } from "./lists";
import { bindPropertyControls } from "./controls";
import { applyPropertyCollapse } from "./form";
import { inputText } from "./value-input";

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
  const panel = container.querySelector<HTMLElement>(":scope > .properties");
  const header = frontmatter(source);
  if (!panel || header?.error) {
    return false;
  }
  const nextRows = nextPropertyRows(source, context);
  const list = panel.querySelector<HTMLElement>(".metadata-properties")!;
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
  const pending = [
    ...list.querySelectorAll<HTMLElement>("[data-property-new]"),
  ];
  const focusedPending = pending.find((row) => row.contains(active));
  placePropertyRows(list, [...rows, ...pending], keep ?? focusedPending);
  applyPropertyCollapse(panel, context.propertyEditor?.collapsed?.() ?? false);
  bindPropertyFields(container, source, context);
  bindPropertyLists(container, source, context);
  bindPropertyControls(container, source, context);
  context.bindRenderedProperties?.(container);

  restoreReplacedFocus(active, activeRow, rows);
  return true;
}

/** Markup for a property sheet, including plugin renderers on the first paint. */
export function propertyMarkup(
  source: string,
  context: PropertyContext,
  allowEmpty: boolean,
): string {
  return renderProperties(source, context.propertyEditor?.types?.(), {
    collapsed: context.propertyEditor?.collapsed?.() ?? false,
    allowEmpty,
    ...(context.renderProperty ? { renderValue: context.renderProperty } : {}),
  });
}

function nextPropertyRows(
  source: string,
  context: PropertyContext,
): HTMLElement[] {
  const fresh = document.createElement("div");
  fresh.innerHTML = sanitize(propertyMarkup(source, context, true));
  return [...fresh.querySelectorAll<HTMLElement>("[data-property-row]")];
}

function keepInput(active: Element | null, row: HTMLElement): boolean {
  if (!(active instanceof HTMLElement) || active.dataset.propertyCommitting) {
    return false;
  }
  if (active.hasAttribute("data-property-name")) {
    return true;
  }
  if (active.hasAttribute("data-property-input")) {
    if (!active.dataset.propertyEditing) {
      return false;
    }
    const replacement = row.querySelector<HTMLElement>("[data-property-input]");
    return (
      replacement?.dataset.propertyKind === active.dataset.propertyKind ||
      !!active.dataset.propertyDirty
    );
  }
  // A focused pill is not text being typed: it re-renders with the list.
  return (
    !!active.closest("[data-property-list]") &&
    !active.hasAttribute("data-property-chip") &&
    (!!inputText(active) || !!active.dataset.propertyEditing)
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
  if (active instanceof HTMLElement) {
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
        row.querySelector<HTMLElement>("[data-property-list-input]") ?? row
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
        keep
          .querySelector(".metadata-property-value")!
          .replaceWith(row.querySelector(".metadata-property-value")!);
        keep.querySelector(".metadata-property-warning-icon")?.remove();
        const warning = row.querySelector(".metadata-property-warning-icon");
        if (warning) {
          keep.append(warning);
        }
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
