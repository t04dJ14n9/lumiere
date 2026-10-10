import {
  focusValue,
  type PropertyControlEdits,
  type PropertyEditor,
} from "./control-edits";

interface RowNavigation {
  row: HTMLElement;
  container: HTMLElement;
  panel: HTMLElement;
  editor: PropertyEditor;
  apply: PropertyControlEdits["apply"];
}

export function bindRowNavigation(options: RowNavigation): void {
  options.row.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.target !== options.row) {
      if (event.key === "Tab") {
        routeFieldTab(event, options.row);
      }
      return;
    }
    if (navigateRow(event, options)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

function navigateRow(event: KeyboardEvent, options: RowNavigation): boolean {
  const { row, container, panel, editor, apply } = options;
  const vim =
    container.closest<HTMLElement>(".cm-editor")?.dataset.vimEnabled === "true";
  const rows = [...panel.querySelectorAll<HTMLElement>("[data-property-row]")];
  const index = rows.indexOf(row);
  const add = panel.querySelector<HTMLButtonElement>("[data-property-add]")!;
  const heading = panel.querySelector<HTMLElement>(
    "[data-properties-heading]",
  )!;
  const input = row.querySelector<HTMLInputElement>("[data-property-name]")!;
  const action = rowKeyAction(event, vim);
  if (!action) {
    return false;
  }
  const actions: Record<RowAction, () => void> = {
    body: () => editor?.focusBody?.(),
    next: () => (rows[index + 1] ?? add).focus(),
    previous: () => (rows[index - 1] ?? heading).focus(),
    name: () => {
      input.focus();
      input.select();
    },
    value: () => focusValue(row, valueSelection(event.key)),
    add: () => add.click(),
    remove: () => {
      apply(
        { type: "remove", keys: [row.dataset.propertyRow!] },
        rows[index + 1]?.dataset.propertyRow ??
          rows[index - 1]?.dataset.propertyRow,
      );
    },
    undo: () => editor?.action?.("undo"),
    redo: () => editor?.action?.("redo"),
    save: () => editor?.action?.("save"),
  };
  actions[action]();
  return true;
}

type RowAction =
  | "body"
  | "next"
  | "previous"
  | "name"
  | "value"
  | "add"
  | "remove"
  | "undo"
  | "redo"
  | "save";
type RowKey = Pick<
  KeyboardEvent,
  "key" | "altKey" | "shiftKey" | "metaKey" | "ctrlKey"
>;

export function rowKeyAction(
  event: RowKey,
  vim: boolean,
): RowAction | undefined {
  if (event.altKey && event.key === "ArrowDown") {
    return "body";
  }
  const motion = rowMotion(event, vim);
  if (motion) {
    return motion;
  }
  if (vim && event.key === "o") {
    return "add";
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return undefined;
  }
  if (event.key.toLowerCase() === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (event.key.toLowerCase() === "s") {
    return "save";
  }
  return undefined;
}

function rowMotion(event: RowKey, vim: boolean): RowAction | undefined {
  if (event.key === "Tab") {
    return event.shiftKey ? "previous" : "next";
  }
  const standard: Partial<Record<string, RowAction>> = {
    ArrowDown: "next",
    ArrowUp: "previous",
    ArrowLeft: "name",
    ArrowRight: "value",
    Enter: "value",
    Delete: "remove",
    Escape: "body",
  };
  const motion = standard[event.key];
  if (motion || !vim) {
    return motion;
  }
  const vimMotions: Partial<Record<string, RowAction>> = {
    j: "next",
    k: "previous",
    h: "name",
    l: "value",
    i: "value",
    A: "value",
  };
  return vimMotions[event.key];
}

export function propertyTabDestination(
  from: "name" | "value" | "row",
  backward: boolean,
): "name" | "value" | "row" | "next" | "previous" {
  if (from === "row") {
    return backward ? "previous" : "next";
  }
  if (from === "name") {
    return backward ? "previous" : "value";
  }
  return backward ? "name" : "row";
}

function routeFieldTab(event: KeyboardEvent, row: HTMLElement): void {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }
  const panel = row.closest(".properties");
  const fromName = event.target.hasAttribute("data-property-name");
  const key = fromName
    ? (event.target as HTMLInputElement).value.trim()
    : row.dataset.propertyRow;
  // Committing can replace the row before this Tab's focus movement.
  if (
    !event.target.dispatchEvent(
      new Event("property-commit", { cancelable: true }),
    )
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const current =
    panel?.querySelector<HTMLElement>(
      `[data-property-row="${CSS.escape(key ?? "")}"]`,
    ) ?? row;
  const destination = propertyTabDestination(
    fromName ? "name" : "value",
    event.shiftKey,
  );
  focusTabDestination(current, panel, destination);
  event.preventDefault();
  event.stopPropagation();
}

function valueSelection(key: string): "start" | "end" | "all" {
  if (key === "A") {
    return "end";
  }
  return key === "Enter" ? "all" : "start";
}

function focusTabDestination(
  row: HTMLElement,
  panel: Element | null,
  destination: ReturnType<typeof propertyTabDestination>,
): void {
  if (destination === "value") {
    focusValue(row);
  } else if (destination === "name") {
    row.querySelector<HTMLElement>("[data-property-name]")?.focus();
  } else if (destination === "previous") {
    const previous = row.previousElementSibling as HTMLElement | null;
    (
      previous ?? panel?.querySelector<HTMLElement>("[data-properties-heading]")
    )?.focus();
  } else if (row.isConnected) {
    row.focus();
  }
}
