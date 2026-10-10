import { frontmatter, type PropertyEdit } from "../../markdown/properties";
import type { PropertyContext } from "./context";
import { focusInput } from "./value-input";

export type PropertyEditor = PropertyContext["propertyEditor"];
export interface PropertyControlEdits {
  current(): ReturnType<typeof frontmatter>;
  apply(operation: PropertyEdit, focusKey?: string, value?: boolean): boolean;
  report(message: string): void;
}

/** Keep draft blur from racing a structural edit that replaces its input. */
export function createControlEdits(options: {
  container: HTMLElement;
  panel: HTMLElement;
  editor: PropertyEditor;
  source: string;
}): PropertyControlEdits {
  const { container, panel, editor, source } = options;
  const notice = panel.querySelector<HTMLElement>(".property-message")!;
  const current = () => frontmatter(editor?.currentSource?.() ?? source);
  const report = (message: string): void => {
    notice.textContent = message;
    notice.setAttribute("role", "alert");
  };
  return {
    current,
    report,
    apply(operation, focusKey, value = false) {
      const owner = container.closest(".cm-editor");
      const input = document.activeElement;
      if (input instanceof HTMLInputElement && panel.contains(input)) {
        input.dataset.propertyCommitting = "true";
      }
      let applied: boolean | undefined;
      try {
        applied = editor?.edit?.(current()?.raw ?? "", operation);
      } finally {
        if (input instanceof HTMLInputElement) {
          delete input.dataset.propertyCommitting;
        }
      }
      if (!applied) {
        if (operation.type !== "add" && operation.type !== "rename") {
          report(
            "This change could not be applied. Check for duplicate names or YAML aliases, then try again.",
          );
        }
        return false;
      }
      focusAfterEdit(owner, focusKey, value);
      return true;
    },
  };
}

function focusAfterEdit(
  owner: Element | null,
  key: string | undefined,
  value: boolean,
): void {
  const row =
    key &&
    owner?.querySelector<HTMLElement>(
      `[data-property-row="${CSS.escape(key)}"]`,
    );
  if (!row) {
    owner?.querySelector<HTMLButtonElement>("[data-property-add]")?.focus();
    return;
  }
  if (value) {
    focusValue(row);
  } else {
    row.focus();
  }
}

export function focusValue(
  row: HTMLElement,
  selection: "start" | "end" | "all" = "start",
): void {
  row.querySelector<HTMLButtonElement>("[data-property-edit]")?.click();
  const input = row.querySelector<HTMLElement>(
    ".metadata-property-value input:not([hidden]), .metadata-property-value [contenteditable]:not([hidden])",
  );
  if (input) {
    focusInput(input, selection);
  }
}
