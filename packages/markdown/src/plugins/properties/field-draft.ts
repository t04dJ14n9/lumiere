import {
  frontmatter,
  propertyInput,
  propertyYamlInput,
  type PropertyValue,
} from "../../markdown/properties";
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

/** Parsed frontmatter snapshot shared across property field bindings. */
export type PropertyBaseline = NonNullable<ReturnType<typeof frontmatter>>;

/** Only an actual edit commits, so focusing a mismatched widget cannot erase YAML. */
export class PropertyField {
  private original: string;
  private isDirty = false;
  private readonly key: string;
  private readonly container: HTMLElement;
  private readonly input: HTMLElement;
  private readonly source: string;
  private readonly editor: PropertyEditor;
  /** Frontmatter bytes when editing started — reject commits if they change. */
  private expectedRaw = "";
  /** JSON snapshot of this property's value when editing started. */
  private baselineValue = "";

  constructor(options: {
    container: HTMLElement;
    input: HTMLElement;
    source: string;
    editor: PropertyEditor;
    baseline?: PropertyBaseline;
  }) {
    this.container = options.container;
    this.input = options.input;
    this.source = options.source;
    this.editor = options.editor;
    this.key = options.input.dataset.propertyInput!;
    if (options.baseline) {
      this.applyBaseline(options.baseline);
    } else {
      this.captureBaseline(options.source);
    }
    this.original = inputText(options.input);
    if (isNativeInput(options.input)) {
      options.input.disabled = !options.editor;
    } else {
      options.input.contentEditable = String(!!options.editor);
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

  private parsedValue(): PropertyValue | undefined {
    const kind = this.input.dataset.propertyKind ?? "text";
    const text = inputText(this.input);
    if (kind === "yaml") {
      return propertyYamlInput(text);
    }
    return propertyInput(kind as PropertyKind, text);
  }

  private reject(message: string): false {
    setInputValidity(this.input, message);
    reportInputValidity(this.input);
    return false;
  }

  private applyBaseline(header: PropertyBaseline | undefined): void {
    this.expectedRaw = header?.raw ?? "";
    try {
      this.baselineValue = JSON.stringify(header?.values?.[this.key]);
    } catch {
      // Recursive aliases cannot stringify; treat as opaque until reopened.
      this.baselineValue = "cycle";
    }
  }

  private captureBaseline(
    source = this.editor?.currentSource?.() ?? this.source,
  ): void {
    this.applyBaseline(frontmatter(source));
  }

  private invalidMessage(): string {
    return this.input.dataset.propertyKind === "yaml"
      ? "Enter valid YAML for this property."
      : "Enter a valid value for this property type.";
  }

  private conflicted(): boolean {
    const live = frontmatter(this.editor?.currentSource?.() ?? this.source);
    try {
      return JSON.stringify(live?.values?.[this.key]) !== this.baselineValue;
    } catch {
      return this.baselineValue !== "cycle";
    }
  }

  private apply(value: PropertyValue): boolean {
    this.input.dataset.propertyCommitting = "true";
    delete this.input.dataset.propertyEditing;
    try {
      const yaml =
        this.input.dataset.propertyKind === "yaml"
          ? inputText(this.input)
          : undefined;
      return this.editor?.set(this.expectedRaw, this.key, value, yaml) ?? false;
    } finally {
      delete this.input.dataset.propertyCommitting;
    }
  }

  private commit(): boolean {
    if (!this.isDirty || this.input.dataset.propertyCommitting) {
      return true;
    }
    const value = this.parsedValue();
    const invalidNative =
      isNativeInput(this.input) && !this.input.checkValidity();
    if (value === undefined || invalidNative) {
      return this.reject(this.invalidMessage());
    }
    if (this.conflicted() || !this.apply(value)) {
      this.input.dataset.propertyEditing = "true";
      return this.reject("The property changed. Reopen it and try again.");
    }
    this.isDirty = false;
    delete this.input.dataset.propertyDirty;
    this.captureBaseline();
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
      // Retained idle rows keep their DOM input across reconciles; refresh the
      // conflict baseline when a new edit begins so earlier edits do not block it.
      if (!this.isDirty) {
        this.captureBaseline();
        this.original = inputText(this.input);
      }
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
    if (this.saveShortcut(event) || this.enterCommit(event)) {
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
    this.editor?.focusBody?.();
  }

  private saveShortcut(event: KeyboardEvent): boolean {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.commit()) {
      this.editor?.action?.("save");
    }
    return true;
  }

  private enterCommit(event: KeyboardEvent): boolean {
    if (event.key !== "Enter" || event.shiftKey) {
      return false;
    }
    // Multiline YAML drafts need Enter for newlines; commit with Ctrl/Cmd+Enter.
    const yamlNewline =
      this.input.dataset.propertyKind === "yaml" &&
      !(event.metaKey || event.ctrlKey);
    if (yamlNewline) {
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.commit()) {
      this.row()?.focus();
    }
    return true;
  }
}
