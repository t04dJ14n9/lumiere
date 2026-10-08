import { frontmatter, propertyInput } from "../../markdown/properties";
import type { PropertyKind } from "../../markdown/properties/types";
import type { PropertyEditor } from "./control-edits";

/** A scalar input keeps its original value until a valid draft is committed. */
export class PropertyField {
  private readonly edit: HTMLButtonElement;
  private readonly display: HTMLElement;
  private readonly original: string;
  private readonly originalValue: unknown;
  private active = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly input: HTMLInputElement,
    private readonly source: string,
    private readonly editor: PropertyEditor,
  ) {
    this.edit = input.parentElement!.querySelector<HTMLButtonElement>(
      "[data-property-edit]",
    )!;
    this.display = input.parentElement!.querySelector<HTMLElement>(
      "[data-property-display]",
    )!;
    this.edit.hidden = !editor;
    input.disabled = !editor;
    this.original = input.value;
    this.originalValue =
      frontmatter(source)?.values?.[input.dataset.propertyInput!];
    this.registerEvents();
  }

  private focusRow(): void {
    this.container
      .querySelector<HTMLElement>(
        `[data-property-row="${CSS.escape(this.input.dataset.propertyInput!)}"]`,
      )
      ?.focus();
  }

  private cancel(): void {
    this.active = false;
    delete this.input.dataset.propertyEditing;
    this.input.value = this.original;
    this.input.setCustomValidity("");
    this.input.hidden = true;
    this.display.hidden = false;
    this.edit.hidden = false;
    this.editor?.refresh?.();
  }

  private commit(): boolean {
    if (!this.active) {
      return true;
    }
    const kind = (this.input.dataset.propertyKind ?? "text") as PropertyKind;
    const value = propertyInput(kind, this.input.value);
    if (value === undefined || !this.input.checkValidity()) {
      this.input.setCustomValidity(
        kind === "number"
          ? "Enter a finite number."
          : "Enter a valid date or date and time.",
      );
      this.input.reportValidity();
      return false;
    }
    const changed = !Object.is(value, this.originalValue);
    this.active = false;
    delete this.input.dataset.propertyEditing;
    if (
      changed &&
      this.editor &&
      !this.editor.set(
        frontmatter(this.editor.currentSource?.() ?? this.source)?.raw ?? "",
        this.input.dataset.propertyInput!,
        value,
      )
    ) {
      this.active = true;
      this.input.dataset.propertyEditing = "true";
      this.input.setCustomValidity(
        "Enter a value compatible with this property, or edit its source.",
      );
      this.input.reportValidity();
      return false;
    }
    if (this.input.isConnected) {
      this.cancel();
    }
    return true;
  }

  private begin(event: MouseEvent): void {
    if (
      !this.editor ||
      (event.target instanceof Element && event.target.closest("a"))
    ) {
      return;
    }
    event.stopPropagation();
    this.active = true;
    this.input.dataset.propertyEditing = "true";
    this.display.hidden = true;
    this.edit.hidden = true;
    this.input.hidden = false;
    this.input.focus();
    this.input.select();
  }

  private registerEvents(): void {
    this.edit.addEventListener("click", (event) => this.begin(event));
    this.display.addEventListener("click", (event) => this.begin(event));
    this.input.addEventListener("input", () =>
      this.input.setCustomValidity(""),
    );
    this.input.addEventListener("property-commit", (event) => {
      if (!this.commit()) {
        event.preventDefault();
      }
    });
    this.input.addEventListener("keydown", (event) => this.keyDown(event));
    this.input.addEventListener("blur", () => this.commit());
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
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (this.commit()) {
        this.focusRow();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      this.focusRow();
    }
  }
}
