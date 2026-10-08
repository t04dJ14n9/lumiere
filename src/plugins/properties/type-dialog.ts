import {
  propertyKindLabels,
  type PropertyKind,
} from "../../markdown/properties/types";

/** A type preference can be shared without silently converting a note's value. */
export function confirmPropertyType(
  key: string,
  before: PropertyKind,
  after: PropertyKind,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "property-type-dialog";
    dialog.setAttribute(
      "aria-label",
      `Change ${key} to ${propertyKindLabels[after]}`,
    );
    const heading = document.createElement("h2");
    heading.textContent = `Change property type to ${propertyKindLabels[after]}`;
    const description = document.createElement("p");
    description.textContent = `“${key}” currently has a ${propertyKindLabels[before]} value. Update it to match the new type?`;
    const update = document.createElement("button"),
      cancel = document.createElement("button");
    update.type = cancel.type = "button";
    update.textContent = "Update";
    cancel.textContent = "Cancel";
    let done = false;
    const close = (accepted: boolean): void => {
      if (done) {
        return;
      }
      done = true;
      signal.removeEventListener("abort", abort);
      dialog.close();
      dialog.remove();
      resolve(accepted);
    };
    const abort = () => close(false);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      close(false);
      return;
    }
    update.addEventListener("click", () => close(true));
    cancel.addEventListener("click", () => close(false));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(false);
    });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter" && event.target !== cancel) {
        event.preventDefault();
        close(true);
      }
    });
    dialog.append(heading, description, update, cancel);
    document.body.append(dialog);
    dialog.showModal();
    update.focus();
  });
}
