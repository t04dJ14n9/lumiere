export function propertyRows(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>("[data-property-row]")];
}

/** Preserve a focused/composing node while moving its siblings around it. */
export function placePropertyRows(
  list: Element,
  rows: HTMLElement[],
  focused?: HTMLElement,
): void {
  const retained = new Set<Element>(rows);
  for (const row of [...list.children]) {
    if (!retained.has(row)) {
      row.remove();
    }
  }
  const before = focused ? rows.indexOf(focused) : 0;
  for (let index = 0; index < before; index++) {
    list.insertBefore(rows[index]!, focused!);
  }
  let next = focused ? focused.nextElementSibling : list.firstElementChild;
  for (const row of rows.slice(focused ? before + 1 : 0)) {
    if (row === next) {
      next = next.nextElementSibling;
    } else {
      list.insertBefore(row, next);
    }
  }
}
