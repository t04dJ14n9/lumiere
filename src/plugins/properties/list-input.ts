import { inputText, setInputText, setInputValidity } from "./value-input";

/** Bind the pill input without committing halfway through an IME session. */
export function bindListInput(
  list: HTMLElement,
  input: HTMLElement,
  actions: { commit(refocus?: boolean): boolean; save(): void; leave(): void },
): void {
  input.addEventListener("input", () => setInputValidity(input, ""));
  input.addEventListener("compositionstart", () => {
    input.dataset.propertyEditing = "true";
  });
  input.addEventListener("compositionend", () => {
    delete input.dataset.propertyEditing;
  });
  input.addEventListener("blur", (event) => {
    if (
      event.relatedTarget instanceof Element &&
      list.contains(event.relatedTarget) &&
      event.relatedTarget.closest("[data-property-remove]")
    ) {
      return;
    }
    actions.commit();
  });
  input.addEventListener("property-commit", (event) => {
    if (!actions.commit()) {
      event.preventDefault();
    }
  });
  input.addEventListener("keydown", (event) =>
    listInputKey(event, input, actions),
  );
  input.addEventListener("paste", (event) => {
    event.preventDefault();
    input.ownerDocument.execCommand(
      "insertText",
      false,
      event.clipboardData?.getData("text/plain") ?? "",
    );
  });
}

function listInputKey(
  event: KeyboardEvent,
  input: HTMLElement,
  actions: { commit(refocus?: boolean): boolean; save(): void; leave(): void },
): void {
  if (event.isComposing) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    setInputText(input, "");
    setInputValidity(input, "");
    actions.leave();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    event.stopPropagation();
    if (actions.commit()) {
      actions.save();
    }
    return;
  }
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (inputText(input)) {
    actions.commit(true);
  }
}
