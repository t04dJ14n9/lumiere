import { frontmatter } from "../../markdown/properties";
import type { PropertyContext } from "./context";
import { PropertyField } from "./field-draft";

const bound = new WeakSet<HTMLInputElement>();

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
  container
    .querySelector(":scope > details.properties")
    ?.querySelectorAll<HTMLInputElement>("input[data-property-input]")
    .forEach((input) => {
      if (bound.has(input)) {
        return;
      }
      bound.add(input);
      new PropertyField(container, input, source, editor);
    });
}

function bindCheckboxes(
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
}
