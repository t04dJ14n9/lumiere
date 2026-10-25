import { createChildEl } from "./dom-helpers";
import { setIcon, setTooltip } from "./obsidian-setting";
export * from "./obsidian-modals";
export * from "./obsidian-setting";

export class BaseComponent {
  disabled = false;

  then(cb: (component: this) => unknown): this {
    cb(this);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
}

export abstract class ValueComponent<T> extends BaseComponent {
  abstract getValue(): T;
  abstract setValue(value: T): this;

  registerOptionListener(
    listeners: Record<string, (value: T) => T>,
    key: string,
  ): this {
    listeners[key] = (value: T) => {
      this.setValue(value);
      return value;
    };
    return this;
  }
}

export class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.buttonEl = createChildEl(containerEl, "button", "mod-button");
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.buttonEl.disabled = disabled;
    return this;
  }

  setCta(): this {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }

  removeCta(): this {
    this.buttonEl.classList.remove("mod-cta");
    return this;
  }

  setWarning(): this {
    this.buttonEl.classList.add("mod-warning");
    return this;
  }

  setTooltip(tooltip: string, options?: { placement?: string }): this {
    setTooltip(this.buttonEl, tooltip, options);
    return this;
  }

  setButtonText(name: string): this {
    this.buttonEl.textContent = name;
    return this;
  }

  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }

  setClass(cls: string): this {
    this.buttonEl.classList.add(cls);
    return this;
  }

  onClick(callback: (evt: MouseEvent) => unknown): this {
    this.buttonEl.addEventListener("click", (evt) => {
      void callback(evt);
    });
    return this;
  }
}

export class ExtraButtonComponent extends BaseComponent {
  extraSettingsEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.extraSettingsEl = createChildEl(
      containerEl,
      "div",
      "clickable-icon extra-setting-button",
    );
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.extraSettingsEl.classList.toggle("is-disabled", disabled);
    return this;
  }

  setTooltip(tooltip: string, options?: { placement?: string }): this {
    setTooltip(this.extraSettingsEl, tooltip, options);
    return this;
  }

  setIcon(icon: string): this {
    setIcon(this.extraSettingsEl, icon);
    return this;
  }

  onClick(callback: (evt: MouseEvent) => unknown): this {
    this.extraSettingsEl.addEventListener("click", (evt) => {
      if (!this.disabled) {
        void callback(evt);
      }
    });
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement;
  private checked = false;
  private changeCallback?: ((value: boolean) => unknown) | undefined;

  constructor(containerEl: HTMLElement) {
    super();
    this.toggleEl = createChildEl(containerEl, "div", "checkbox-container");
    this.toggleEl.addEventListener("click", () => {
      if (!this.disabled) {
        this.onClick();
      }
    });
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.toggleEl.classList.toggle("is-disabled", disabled);
    return this;
  }

  getValue(): boolean {
    return this.checked;
  }

  setValue(value: boolean): this {
    this.checked = Boolean(value);
    this.toggleEl.classList.toggle("is-enabled", this.checked);
    return this;
  }

  setTooltip(tooltip: string, options?: { placement?: string }): this {
    setTooltip(this.toggleEl, tooltip, options);
    return this;
  }

  onClick(): void {
    this.setValue(!this.checked);
    void this.changeCallback?.(this.checked);
  }

  onChange(callback: (value: boolean) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export abstract class AbstractTextComponent<
  T extends HTMLInputElement | HTMLTextAreaElement,
> extends ValueComponent<string> {
  inputEl: T;
  private changeCallback?: ((value: string) => unknown) | undefined;

  constructor(inputEl: T) {
    super();
    this.inputEl = inputEl;
    this.inputEl.addEventListener("input", () => {
      this.onChanged();
    });
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.inputEl.disabled = disabled;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setValue(value: string): this {
    this.inputEl.value = String(value ?? "");
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChanged(): void {
    void this.changeCallback?.(this.getValue());
  }

  onChange(callback: (value: string) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    super(createChildEl(containerEl, "input", { type: "text" }));
  }
}

export class SearchComponent extends AbstractTextComponent<HTMLInputElement> {
  clearButtonEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    const wrap = createChildEl(containerEl, "div", "search-input-container");
    super(createChildEl(wrap, "input", { type: "search" }));
    this.clearButtonEl = createChildEl(
      wrap,
      "div",
      "search-input-clear-button",
    );
    this.clearButtonEl.addEventListener("click", () => {
      this.setValue("");
      this.onChanged();
    });
  }
}

export class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {
  constructor(containerEl: HTMLElement) {
    super(createChildEl(containerEl, "textarea"));
  }
}

export class MomentFormatComponent extends TextComponent {
  sampleEl: HTMLElement | null = null;
  defaultFormat = "YYYY-MM-DD";

  setDefaultFormat(defaultFormat: string): this {
    this.defaultFormat = defaultFormat;
    this.setPlaceholder(defaultFormat);
    return this;
  }

  setSampleEl(sampleEl: HTMLElement): this {
    this.sampleEl = sampleEl;
    this.updateSample();
    return this;
  }

  override setValue(value: string): this {
    super.setValue(value);
    this.updateSample();
    return this;
  }

  override onChanged(): void {
    super.onChanged();
    this.updateSample();
  }

  updateSample(): void {
    if (this.sampleEl) {
      this.sampleEl.textContent = this.getValue() || this.defaultFormat;
    }
  }
}

export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  private changeCallback?: ((value: string) => unknown) | undefined;

  constructor(containerEl: HTMLElement) {
    super();
    this.selectEl = createChildEl(containerEl, "select", "dropdown");
    this.selectEl.addEventListener("change", () => {
      void this.changeCallback?.(this.getValue());
    });
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.selectEl.disabled = disabled;
    return this;
  }

  addOption(value: string, display: string): this {
    createChildEl(this.selectEl, "option", { value, text: display });
    return this;
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display);
    }
    return this;
  }

  getValue(): string {
    return this.selectEl.value;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class SliderComponent extends ValueComponent<number> {
  sliderEl: HTMLInputElement;
  private changeCallback?: ((value: number) => unknown) | undefined;

  constructor(containerEl: HTMLElement) {
    super();
    this.sliderEl = createChildEl(containerEl, "input", {
      cls: "slider",
      type: "range",
    });
    this.sliderEl.addEventListener("input", () => {
      void this.changeCallback?.(this.getValue());
    });
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.sliderEl.disabled = disabled;
    return this;
  }

  setLimits(
    min: number | null,
    max: number | null,
    step: number | "any",
  ): this {
    if (min !== null) {
      this.sliderEl.min = String(min);
    }
    if (max !== null) {
      this.sliderEl.max = String(max);
    }
    this.sliderEl.step = String(step);
    return this;
  }

  getValue(): number {
    return Number(this.sliderEl.value);
  }

  getValuePretty(): string {
    return this.sliderEl.value;
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  showTooltip(): void {}

  onChange(callback: (value: number) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class ColorComponent extends ValueComponent<string> {
  colorPickerEl: HTMLInputElement;
  private changeCallback?: ((value: string) => unknown) | undefined;

  constructor(containerEl: HTMLElement) {
    super();
    this.colorPickerEl = createChildEl(containerEl, "input", { type: "color" });
    this.colorPickerEl.addEventListener("input", () => {
      void this.changeCallback?.(this.getValue());
    });
  }

  getValue(): string {
    return this.colorPickerEl.value;
  }

  setValue(value: string): this {
    this.colorPickerEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class ProgressBarComponent extends ValueComponent<number> {
  progressBar: HTMLElement;
  private val = 0;

  constructor(containerEl: HTMLElement) {
    super();
    this.progressBar = createChildEl(containerEl, "div", "progress-bar");
  }

  getValue(): number {
    return this.val;
  }

  setValue(value: number): this {
    this.val = value;
    this.progressBar.dataset.value = String(value);
    return this;
  }

  setVisibility(visible: boolean): this {
    this.progressBar.style.display = visible ? "" : "none";
    return this;
  }
}
