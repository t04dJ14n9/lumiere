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
  add.addEventListener("click", () => {
    applyPropertyCollapse(panel, false);
    editor?.setCollapsed?.(false);
    appendPendingRow(panel, editor, apply);
  });
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
  input.addEventListener("property-commit", (event) => {
    if (input.value.trim() && !create()) {
      event.preventDefault();
    }
  });
  input.addEventListener("keydown", (event) =>
    pendingKeyDown(event, { input, editor, suggestions, create }),
  );
  row.addEventListener("keydown", (event) => {
    if (event.target === row && event.key === "Escape") {
      event.preventDefault();
      editor?.focusBody?.();
    }
    if (event.target === row && event.key === "Delete") {
      event.preventDefault();
      row.remove();
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
  },
): void {
  if (event.isComposing) {
    return;
  }
  const { editor, suggestions, create } = options;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    suggestions.move(event.key === "ArrowDown" ? 1 : -1);
  } else if (
    event.key === "Enter" ||
    (event.key === "Tab" && !event.shiftKey)
  ) {
    create();
  } else if (event.key === "Escape") {
    suggestions.hide();
    editor?.focusBody?.();
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

function navigateHeading(
  event: KeyboardEvent,
  options: {
    panel: HTMLElement;
    editor: PropertyEditor;
    collapse(value: boolean): void;
  },
): boolean {
  const { panel, editor, collapse } = options;
  const key = event.key === "Tab" ? tabHeadingKey(event.shiftKey) : event.key;
  const actions: Readonly<Record<string, () => void>> = {
    ArrowDown: () => focusFirstProperty(panel, editor, event.altKey),
    ArrowUp: () => editor?.focusTitle?.(),
    ArrowLeft: () => collapse(true),
    ArrowRight: () => collapse(false),
    Enter: () => collapse(!panel.classList.contains("is-collapsed")),
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
