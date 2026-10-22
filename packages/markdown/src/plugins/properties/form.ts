import { frontmatter } from "../../markdown/properties";
import { propertyNameAvailable } from "../../markdown/properties/types";
import type { PropertyContext } from "./context";
import type { PropertyControlEdits } from "./control-edits";
import { pendingPropertyRow } from "./sheet-html";
import { PropertyNameSuggestions } from "./name-suggestions";

type PropertyEditor = PropertyContext["propertyEditor"];

export function applyPropertyCollapse(
  panel: HTMLElement,
  collapsed: boolean,
): void {
  panel.classList.toggle("is-collapsed", collapsed);
  const heading = panel.querySelector<HTMLElement>("[data-properties-heading]");
  heading?.setAttribute("aria-expanded", String(!collapsed));
  const content = panel.querySelector<HTMLElement>(".metadata-content");
  if (content) {
    content.hidden = collapsed;
  }
}

export function bindPropertyForm(
  panel: HTMLElement,
  editor: PropertyEditor,
  apply: PropertyControlEdits["apply"],
): void {
  bindHeadingNavigation(panel, editor);
  const add = panel.querySelector<HTMLButtonElement>("[data-property-add]")!;
  add.hidden = !editor?.edit;
  add.addEventListener("keydown", (event) =>
    navigateAddButton(event, panel, editor),
  );
  add.addEventListener("click", () => {
    applyPropertyCollapse(panel, false);
    editor?.setCollapsed?.(false);
    appendPendingRow(panel, editor, apply);
  });
}

/**
 * Measured in Obsidian 1.14.4: Up and Shift+Tab go to the last row (the
 * heading when there are none); Down, Tab and Escape return to the text.
 */
/**
 * Obsidian add-button motion (1.14.4): ArrowUp / k / Shift+Tab → last row;
 * ArrowDown / j / Tab / Escape → body. `j`/`k` are always live, not vim-gated.
 */
export function addButtonDirection(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "isComposing"
  >,
): "forward" | "backward" | undefined {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }
  if (event.key === "Tab") {
    return event.shiftKey ? "backward" : "forward";
  }
  if (event.key === "ArrowUp" || event.key === "k") {
    return "backward";
  }
  return ["ArrowDown", "Escape", "j"].includes(event.key)
    ? "forward"
    : undefined;
}

function navigateAddButton(
  event: KeyboardEvent,
  panel: HTMLElement,
  editor: PropertyEditor,
): void {
  const direction = addButtonDirection(event);
  if (!direction) {
    return;
  }
  const forward = direction === "forward";
  event.preventDefault();
  event.stopPropagation();
  if (forward) {
    editor?.focusBody?.();
    return;
  }
  const rows = [
    ...panel.querySelectorAll<HTMLElement>("[data-property-row]"),
  ].filter((row) => !row.hidden);
  (
    rows.at(-1) ?? panel.querySelector<HTMLElement>("[data-properties-heading]")
  )?.focus();
}

function appendPendingRow(
  panel: HTMLElement,
  editor: PropertyEditor,
  apply: PropertyControlEdits["apply"],
): void {
  const wrapper = panel.ownerDocument.createElement("div");
  wrapper.innerHTML = pendingPropertyRow();
  const row = wrapper.firstElementChild as HTMLElement;
  panel.querySelector(".metadata-properties")!.append(row);
  const input = row.querySelector<HTMLInputElement>("input")!;
  const suggestions = new PropertyNameSuggestions(input, () => create());
  const create = (): boolean => {
    const key = suggestions.name();
    const values = frontmatter(editor?.currentSource?.() ?? "")?.values ?? {};
    if (!propertyNameAvailable(key, Object.keys(values))) {
      return false;
    }
    // Reconciliation may run synchronously; hide this draft before writing its key.
    row.hidden = true;
    if (!apply({ type: "add", key }, key, true)) {
      row.hidden = false;
      return false;
    }
    row.remove();
    return true;
  };
  const dismiss = (focusBody: boolean): void => {
    if (!row.isConnected) {
      return;
    }
    suggestions.hide();
    row.remove();
    if (focusBody) {
      editor?.focusBody?.();
    }
  };
  input.addEventListener("property-commit", (event) => {
    if (input.value.trim() && !create()) {
      event.preventDefault();
    }
  });
  input.addEventListener("keydown", (event) =>
    pendingKeyDown(event, { input, editor, suggestions, create, dismiss }),
  );
  // Leave the unfinished draft when focus moves into the note body (or any
  // control outside this row). Suggestion mousedown preventDefault keeps focus
  // on the input long enough to accept a name without dismissing first.
  input.addEventListener("blur", () => {
    void Promise.resolve().then(() => {
      if (!row.isConnected) {
        return;
      }
      const active = input.ownerDocument.activeElement;
      if (active != null && row.contains(active)) {
        return;
      }
      dismiss(false);
    });
  });
  row.addEventListener("keydown", (event) => {
    if (event.target === row && event.key === "Escape") {
      event.preventDefault();
      dismiss(true);
    }
    if (event.target === row && event.key === "Delete") {
      event.preventDefault();
      dismiss(false);
    }
  });
  input.focus();
  void editor
    ?.names?.()
    .then((names) => suggestions.receive(names))
    .catch(() => {});
}

function pendingKeyDown(
  event: KeyboardEvent,
  options: {
    input: HTMLInputElement;
    editor: PropertyEditor;
    suggestions: PropertyNameSuggestions;
    create(): boolean;
    dismiss(focusBody: boolean): void;
  },
): void {
  if (event.isComposing) {
    return;
  }
  const { suggestions, create, dismiss } = options;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    suggestions.move(event.key === "ArrowDown" ? 1 : -1);
  } else if (
    event.key === "Enter" ||
    (event.key === "Tab" && !event.shiftKey)
  ) {
    create();
  } else if (event.key === "Escape") {
    // Host GUI BH-008: Escape dismisses the unfinished Add-property draft
    // without writing YAML (Obsidian kept the empty row; we clear it).
    dismiss(true);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function bindHeadingNavigation(
  panel: HTMLElement,
  editor: PropertyEditor,
): void {
  const heading = panel.querySelector<HTMLElement>(
    "[data-properties-heading]",
  )!;
  const collapse = (collapsed: boolean): void => {
    applyPropertyCollapse(panel, collapsed);
    editor?.setCollapsed?.(collapsed);
  };
  heading.addEventListener("click", () =>
    collapse(!panel.classList.contains("is-collapsed")),
  );
  heading.addEventListener("keydown", (event) => {
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      !navigateHeading(event, { panel, editor, collapse })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
}

/** Obsidian heading Down / `j` alias (measured 1.14.4). */
export function headingMotionKey(key: string): string {
  return key === "j" ? "ArrowDown" : key;
}

function navigateHeading(
  event: KeyboardEvent,
  options: {
    panel: HTMLElement;
    editor: PropertyEditor;
    collapse(value: boolean): void;
  },
): boolean {
  const { panel, editor, collapse } = options;
  // Obsidian maps heading `j` like ArrowDown (always; not vim-gated).
  // Enter does not collapse (G16 / #148).
  const key =
    event.key === "Tab"
      ? tabHeadingKey(event.shiftKey)
      : headingMotionKey(event.key);
  const actions: Readonly<Record<string, () => void>> = {
    ArrowDown: () => focusFirstProperty(panel, editor, event.altKey),
    ArrowUp: () => editor?.focusTitle?.(),
    ArrowLeft: () => collapse(true),
    ArrowRight: () => collapse(false),
    " ": () => editor?.pageHeading?.(event.shiftKey),
    Escape: () => editor?.focusBody?.(),
  };
  if (!Object.hasOwn(actions, key)) {
    return false;
  }
  actions[key]?.();
  return true;
}

function tabHeadingKey(backward: boolean): string {
  return backward ? "ArrowUp" : "ArrowDown";
}

function focusFirstProperty(
  panel: HTMLElement,
  editor: PropertyEditor,
  skipRows: boolean,
): void {
  const first =
    !panel.classList.contains("is-collapsed") && !skipRows
      ? panel.querySelector<HTMLElement>(
          "[data-property-row], [data-property-add]",
        )
      : null;
  if (first) {
    first.focus();
  } else {
    editor?.focusBody?.();
  }
}
