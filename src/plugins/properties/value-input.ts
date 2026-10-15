/** Both native typed controls and editable text share draft/focus operations. */
export function isNativeInput(
  input: HTMLElement,
): input is HTMLInputElement | HTMLTextAreaElement {
  return input.tagName === "INPUT" || input.tagName === "TEXTAREA";
}

export function inputText(input: HTMLElement): string {
  return isNativeInput(input) ? input.value : (input.textContent ?? "");
}

export function setInputText(input: HTMLElement, text: string): void {
  if (isNativeInput(input)) {
    input.value = text;
  } else {
    input.textContent = text;
  }
}

export function setInputValidity(input: HTMLElement, message: string): void {
  if (isNativeInput(input)) {
    input.setCustomValidity(message);
    return;
  }
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
  input.title = message;
}

export function reportInputValidity(input: HTMLElement): void {
  if (isNativeInput(input)) {
    input.reportValidity();
  }
}

export function focusInput(
  input: HTMLElement,
  selection: "start" | "end" | "all" = "start",
): void {
  input.focus();
  if (isNativeInput(input)) {
    if (input instanceof HTMLTextAreaElement || input.type === "text") {
      input.setSelectionRange(
        selection === "end" ? input.value.length : 0,
        selection === "start" ? 0 : input.value.length,
      );
    }
    return;
  }
  const range = input.ownerDocument.createRange();
  range.selectNodeContents(input);
  if (selection !== "all") {
    range.collapse(selection === "start");
  }
  const caret = input.ownerDocument.getSelection();
  caret?.removeAllRanges();
  caret?.addRange(range);
}
