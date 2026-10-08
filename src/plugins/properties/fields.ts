import { frontmatter, propertyInput } from "../../markdown/properties";
import type { PropertyKind } from "../../markdown/properties/types";
import type { PropertyContext } from "./context";

const bound = new WeakSet<HTMLInputElement>();

export function bindPropertyFields(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): void {
  container
    .querySelector(":scope > details.properties")
    ?.querySelectorAll<HTMLInputElement>("input[data-property]")
    .forEach((checkbox) => {
      if (bound.has(checkbox)) {
        return;
      }
      bound.add(checkbox);
      checkbox.disabled = context.propertyEditor?.source !== context.source;
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        if (
          !checkbox.disabled &&
          !context.propertyEditor?.set(
            frontmatter(context.propertyEditor.currentSource?.() ?? source)
              ?.raw ?? "",
            checkbox.dataset.property!,
            checkbox.checked,
          )
        ) {
          checkbox.checked = !checkbox.checked;
        }
      });
    });
  container
    .querySelector(":scope > details.properties")
    ?.querySelectorAll<HTMLInputElement>("input[data-property-input]")
    .forEach((input) => {
      if (bound.has(input)) {
        return;
      }
      bound.add(input);
      const edit = input.parentElement!.querySelector<HTMLButtonElement>(
        "[data-property-edit]",
      )!;
      const display = input.parentElement!.querySelector<HTMLElement>(
        "[data-property-display]",
      )!;
      const editor =
        context.propertyEditor?.source === context.source
          ? context.propertyEditor
          : undefined;
      edit.hidden = !editor;
      input.disabled = !editor;
      const original = input.value;
      const originalValue =
        frontmatter(source)?.values?.[input.dataset.propertyInput!];
      const currentHeader = () =>
        frontmatter(editor?.currentSource?.() ?? source);
      const focusRow = (): void => {
        container
          .querySelector<HTMLElement>(
            `[data-property-row="${CSS.escape(input.dataset.propertyInput!)}"]`,
          )
          ?.focus();
      };
      let active = false;
      const cancel = (): void => {
        active = false;
        delete input.dataset.propertyEditing;
        input.value = original;
        input.setCustomValidity("");
        input.hidden = true;
        display.hidden = false;
        edit.hidden = false;
        editor?.refresh?.();
      };
      const commit = (): boolean => {
        if (!active) {
          return true;
        }
        const kind = (input.dataset.propertyKind ?? "text") as PropertyKind;
        const value = propertyInput(kind, input.value);
        if (value === undefined || !input.checkValidity()) {
          input.setCustomValidity(
            kind === "number"
              ? "Enter a finite number."
              : "Enter a valid date or date and time.",
          );
          input.reportValidity();
          return false;
        }
        const changed = !Object.is(value, originalValue);
        active = false;
        delete input.dataset.propertyEditing;
        if (
          changed &&
          editor &&
          !editor.set(
            currentHeader()?.raw ?? "",
            input.dataset.propertyInput!,
            value,
          )
        ) {
          active = true;
          input.dataset.propertyEditing = "true";
          input.setCustomValidity(
            "Enter a value compatible with this property, or edit its source.",
          );
          input.reportValidity();
          return false;
        }
        if (input.isConnected) {
          cancel();
        }
        return true;
      };
      const begin = (event: MouseEvent): void => {
        if (
          !editor ||
          (event.target instanceof Element && event.target.closest("a"))
        ) {
          return;
        }
        event.stopPropagation();
        active = true;
        input.dataset.propertyEditing = "true";
        display.hidden = true;
        edit.hidden = true;
        input.hidden = false;
        input.focus();
        input.select();
      };
      edit.addEventListener("click", begin);
      display.addEventListener("click", begin);
      input.addEventListener("input", () => input.setCustomValidity(""));
      input.addEventListener("property-commit", (event) => {
        if (!commit()) {
          event.preventDefault();
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.isComposing) {
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (commit()) {
            editor?.action?.("save");
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          if (commit()) {
            focusRow();
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          focusRow();
        }
      });
      input.addEventListener("blur", commit);
    });
}
