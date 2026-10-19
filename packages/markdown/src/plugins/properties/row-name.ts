import { propertyNameAvailable } from "../../markdown/properties/types";
import {
  focusValue,
  type PropertyControlEdits,
  type PropertyEditor,
} from "./control-edits";

/** A rename does not change either name's vault-wide type preference. */
export function bindRowName(
  row: HTMLElement,
  key: string,
  editor: PropertyEditor,
  edits: Pick<PropertyControlEdits, "apply" | "current">,
): void {
  const input = row.querySelector<HTMLInputElement>("[data-property-name]")!;
  input.disabled = !editor?.edit;
  const rename = () => renameProperty({ input, key, edits });
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
        if (row.isConnected) {
          focusValue(row);
        }
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = key;
      input.setCustomValidity("");
      editor?.focusBody?.();
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
  edits: Pick<PropertyControlEdits, "apply" | "current">;
}): boolean {
  const { input, key, edits } = options;
  if (input.dataset.propertyCommitting) {
    return true;
  }
  const next = input.value.trim();
  if (next === key) {
    input.value = key;
    return true;
  }
  if (
    !propertyNameAvailable(
      next,
      Object.keys(edits.current()?.values ?? {}),
      key,
    )
  ) {
    return false;
  }
  return edits.apply({ type: "rename", key, name: next }, next, true);
}
