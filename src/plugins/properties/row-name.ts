import { validPropertyName } from "../../markdown/properties/types";
import type { PropertyControlEdits, PropertyEditor } from "./control-edits";

/** Rename commits before save and retains an explicitly chosen property type. */
export function bindRowName(
  row: HTMLElement,
  key: string,
  editor: PropertyEditor,
  edits: Pick<PropertyControlEdits, "apply">,
): void {
  const input = row.querySelector<HTMLInputElement>("[data-property-name]")!;
  input.disabled = !editor?.edit;
  const rename = () => renameProperty({ input, key, editor, edits });
  input.addEventListener("input", () => input.setCustomValidity(""));
  input.addEventListener("blur", rename);
  input.addEventListener("property-commit", (event) => {
    if (!rename()) {
      event.preventDefault();
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (rename()) {
        row.focus();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = key;
      input.setCustomValidity("");
      row.focus();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (rename()) {
        editor?.action?.("save");
      }
    }
  });
}

function renameProperty(options: {
  input: HTMLInputElement;
  key: string;
  editor: PropertyEditor;
  edits: Pick<PropertyControlEdits, "apply">;
}): boolean {
  const { input, key, editor, edits } = options;
  const next = input.value.trim();
  if (next === key) {
    input.value = key;
    return true;
  }
  if (!validPropertyName(next)) {
    input.setCustomValidity("Enter a non-empty property name on one line.");
    input.reportValidity();
    return false;
  }
  const kind = editor?.types?.()[key.toLowerCase()];
  if (!edits.apply({ type: "rename", key, name: next }, next)) {
    input.setCustomValidity(
      "This property name is already used, or the properties changed.",
    );
    input.reportValidity();
    return false;
  }
  if (kind && !Object.hasOwn(editor?.types?.() ?? {}, next.toLowerCase())) {
    editor?.setType?.(next, kind);
  }
  return true;
}
