import {
  inferPropertyKind,
  validPropertyName,
  type PropertyKind,
} from "../../markdown/properties/types";
import type { PropertyEdit } from "../../markdown/properties";
import type { PropertyContext } from "./context";
export function bindPropertyForm(
  panel: HTMLElement,
  editor: PropertyContext["propertyEditor"],
  apply: (
    operation: PropertyEdit,
    focusKey?: string,
    value?: boolean,
  ) => boolean,
): void {
  bindHeadingNavigation(panel, editor);
  const add = panel.querySelector<HTMLButtonElement>("[data-property-add]")!;
  const form = panel.querySelector<HTMLElement>("[data-property-new]")!;
  const name = form.querySelector<HTMLInputElement>("input")!;
  add.hidden = !editor?.edit;
  add.addEventListener("click", () => {
    form.hidden = false;
    name.focus();
  });
  const cancel = (): void => {
    form.hidden = true;
    name.value = "";
    name.setCustomValidity("");
    add.focus();
  };
  const create = () => createProperty({ name, form, editor, apply });
  name.addEventListener("input", () => name.setCustomValidity(""));
  name.addEventListener("property-commit", (event) => {
    if (name.value.trim() && !create()) {
      event.preventDefault();
    }
  });
  name.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        create();
      } else {
        cancel();
      }
    }
  });
  form
    .querySelector("[data-property-confirm]")!
    .addEventListener("click", create);
  form
    .querySelector("[data-property-cancel]")!
    .addEventListener("click", cancel);
}

function bindHeadingNavigation(
  panel: HTMLElement,
  editor: PropertyContext["propertyEditor"],
): void {
  const summary = panel.querySelector<HTMLElement>(":scope > summary")!;
  const heading = summary.querySelector<HTMLElement>(
    "[data-properties-heading]",
  )!;
  heading.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.key === " ") {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      editor?.pageHeading?.(event.shiftKey);
    } else if (
      !navigateHeading(event.key, event.altKey, { panel, summary, editor })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
}

function createProperty(options: {
  name: HTMLInputElement;
  form: HTMLElement;
  editor: PropertyContext["propertyEditor"];
  apply: (
    operation: PropertyEdit,
    focusKey?: string,
    value?: boolean,
  ) => boolean;
}): boolean {
  const { name, form, editor, apply } = options;
  const key = name.value.trim();
  if (!validPropertyName(key)) {
    name.setCustomValidity("Enter a property name.");
    name.reportValidity();
    return false;
  }
  const kind: PropertyKind = inferPropertyKind(key, null, editor?.types?.());
  const pendingName = name.value;
  name.value = "";
  form.hidden = true;
  if (
    !apply(
      {
        type: "add",
        key,
        value: kind === "list" || kind === "tags" ? [] : null,
      },
      key,
      true,
    )
  ) {
    name.value = pendingName;
    form.hidden = false;
    name.setCustomValidity(
      "This property already exists, or the properties changed.",
    );
    name.reportValidity();
    return false;
  }
  return true;
}

function navigateHeading(
  key: string,
  altKey: boolean,
  options: {
    panel: HTMLElement;
    summary: HTMLElement;
    editor: PropertyContext["propertyEditor"];
  },
): boolean {
  const { panel, summary, editor } = options;
  if (key === "ArrowDown") {
    const first =
      panel.hasAttribute("open") && !altKey
        ? panel.querySelector<HTMLElement>(
            "[data-property-row], [data-property-add]",
          )
        : null;
    if (first) {
      first.focus();
    } else {
      editor?.focusBody?.();
    }
  } else if (key === "ArrowUp") {
    editor?.focusTitle?.();
  } else if (key === "ArrowLeft" || key === "ArrowRight") {
    if (panel.hasAttribute("open") !== (key === "ArrowRight")) {
      summary.click();
    }
  } else if (key !== "Enter") {
    return false;
  }
  return true;
}
