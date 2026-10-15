import { frontmatter } from "../../markdown/properties";
import type { PropertyContext } from "./context";
import { PropertyField } from "./field-draft";

const bound = new WeakSet<HTMLElement>();

export function bindPropertyFields(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): void {
  bindCheckboxes(container, source, context);
  const editor =
    context.propertyEditor?.source === context.source
      ? context.propertyEditor
      : undefined;
  // Parse once for every field on this sheet; each field would otherwise
  // re-parse the same frontmatter during construction.
  const baseline = frontmatter(source);
  container
    .querySelector(":scope > .properties")
    ?.querySelectorAll<HTMLElement>("[data-property-input]")
    .forEach((input) => {
      if (bound.has(input)) {
        return;
      }
      bound.add(input);
      new PropertyField({
        container,
        input,
        source,
        editor,
        ...(baseline ? { baseline } : {}),
      });
    });
}

function bindCheckboxes(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): void {
  container
    .querySelector(":scope > .properties")
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
}
