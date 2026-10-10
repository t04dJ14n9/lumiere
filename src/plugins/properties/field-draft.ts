import { frontmatter, propertyInput } from "../../markdown/properties";
import type { PropertyKind } from "../../markdown/properties/types";
import type { PropertyEditor } from "./control-edits";
import {
  focusInput,
  inputText,
  isNativeInput,
  reportInputValidity,
  setInputText,
  setInputValidity,
} from "./value-input";

/** Only an actual edit commits, so focusing a mismatched widget cannot erase YAML. */
export class PropertyField {
  private original: string;
  private isDirty = false;
  private readonly key: string;

  constructor(
    private readonly container: HTMLElement,
    private readonly input: HTMLElement,
    private readonly source: string,
    private readonly editor: PropertyEditor,
  ) {
    this.key = input.dataset.propertyInput!;
    this.original = inputText(input);
    if (isNativeInput(input)) {
      input.disabled = !editor;
    } else {
      input.contentEditable = String(!!editor);
    }
    this.registerEvents();
    this.registerLink();
  }

  private row(): HTMLElement | null {
    return this.container.querySelector(
      `[data-property-row="${CSS.escape(this.key)}"]`,
    );
  }

  private cancel(): void {
    this.isDirty = false;
    delete this.input.dataset.propertyDirty;
    delete this.input.dataset.propertyEditing;
    setInputText(this.input, this.original);
    setInputValidity(this.input, "");
    this.editor?.refresh?.();
  }

  private commit(): boolean {
    if (!this.isDirty || this.input.dataset.propertyCommitting) {
      return true;
    }
    const kind = (this.input.dataset.propertyKind ?? "text") as PropertyKind;
    const value = propertyInput(kind, inputText(this.input));
    if (
      value === undefined ||
      (isNativeInput(this.input) && !this.input.checkValidity())
    ) {
      setInputValidity(
        this.input,
        "Enter a valid value for this property type.",
      );
      reportInputValidity(this.input);
      return false;
    }
    this.input.dataset.propertyCommitting = "true";
    delete this.input.dataset.propertyEditing;
    let applied = false;
    try {
      applied =
        this.editor?.set(
          frontmatter(this.editor.currentSource?.() ?? this.source)?.raw ?? "",
          this.key,
          value,
        ) ?? false;
    } finally {
      delete this.input.dataset.propertyCommitting;
    }
    if (!applied) {
      this.input.dataset.propertyEditing = "true";
      setInputValidity(
        this.input,
        "The property changed. Reopen it and try again.",
      );
      reportInputValidity(this.input);
      return false;
    }
    this.isDirty = false;
    delete this.input.dataset.propertyDirty;
    this.original = inputText(this.input);
    return true;
  }

  private registerLink(): void {
    const display = this.input.parentElement?.querySelector<HTMLElement>(
      "[data-property-display]",
    );
    const edit = display?.querySelector<HTMLElement>("[data-property-edit]");
    if (!edit || !display) {
      return;
    }
    edit.hidden = !this.editor;
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      display.hidden = true;
      this.input.hidden = false;
      focusInput(this.input, "all");
    });
  }

  private registerEvents(): void {
    this.input.addEventListener("focus", () => {
      this.input.dataset.propertyEditing = "true";
    });
    this.input.addEventListener("input", () => {
      this.isDirty = true;
      this.input.dataset.propertyDirty = "true";
      setInputValidity(this.input, "");
    });
    this.input.addEventListener("property-commit", (event) => {
      if (!this.commit()) {
        event.preventDefault();
      }
    });
    this.input.addEventListener("keydown", (event) => this.keyDown(event));
    this.input.addEventListener("blur", () => {
      if (this.commit()) {
        delete this.input.dataset.propertyEditing;
        this.editor?.refresh?.();
      }
    });
    this.input.addEventListener("paste", (event) => {
      if (!isNativeInput(this.input)) {
        event.preventDefault();
        // Keep arbitrary clipboard markup out of the property DOM.
        this.input.ownerDocument.execCommand(
          "insertText",
          false,
          event.clipboardData?.getData("text/plain") ?? "",
        );
      }
    });
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (this.commit()) {
        this.editor?.action?.("save");
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      if (this.commit()) {
        this.row()?.focus();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      this.editor?.focusBody?.();
    }
  }
}
