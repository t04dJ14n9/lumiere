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
    if (event.target !== options.row || event.isComposing) {
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
    ":scope > summary [data-properties-heading]",
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
  if (event.key === "Backspace") {
    return "remove";
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

function valueSelection(key: string): "start" | "end" | "all" {
  if (key === "A") {
    return "end";
  }
  return key === "Enter" ? "all" : "start";
}
