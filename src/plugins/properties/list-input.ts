/** Bind the add-item input without committing halfway through an IME session. */
export function bindListInput(
  list: HTMLElement,
  input: HTMLInputElement,
  actions: { commit(refocus?: boolean): boolean; save(): void },
): void {
  input.addEventListener("input", () => input.setCustomValidity(""));
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
}

function listInputKey(
  event: KeyboardEvent,
  input: HTMLInputElement,
  actions: { commit(refocus?: boolean): boolean; save(): void },
): void {
  if (event.isComposing) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    input.value = "";
    input.setCustomValidity("");
    input.blur();
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
  actions.commit(true);
}
