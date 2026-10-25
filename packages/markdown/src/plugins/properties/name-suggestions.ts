import { validPropertyName } from "../../markdown/properties/types";

export function propertyNameSuggestions(
  names: readonly string[],
  query: string,
): string[] {
  const text = query.trim().toLowerCase();
  return [...new Set(names.filter(validPropertyName))]
    .filter((name) => name.toLowerCase().includes(text))
    .sort((left, right) => {
      const prefix =
        Number(right.toLowerCase().startsWith(text)) -
        Number(left.toLowerCase().startsWith(text));
      return prefix || left.localeCompare(right);
    })
    .slice(0, 50);
}

/** Suggestions belong to one pending row, never to the document or another panel. */
export class PropertyNameSuggestions {
  private names: readonly string[] = [];
  private choices: string[] = [];
  private selected = 0;
  private readonly popup: HTMLElement;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly accept: () => void,
    /** Escape dismisses the unfinished draft (BH-008), not only the list. */
    private readonly onEscape?: () => void,
  ) {
    this.popup = input.ownerDocument.createElement("div");
    this.popup.className = "property-name-suggestions";
    this.popup.setAttribute("role", "listbox");
    this.popup.setAttribute("aria-label", "Vault property names");
    this.popup.id = `property-names-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    input.setAttribute("aria-controls", this.popup.id);
    input.parentElement!.append(this.popup);
    input.addEventListener("input", () => this.filter());
    input.addEventListener("focus", () => this.render());
    input.addEventListener("blur", () => this.hide());
    // Do not stopPropagation: form capture/bubble also dismisses the draft row.
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key !== "Escape" || !this.onEscape) {
        return;
      }
      event.preventDefault();
      // Do not stopPropagation — form capture also dismisses; either path may win.
      this.onEscape();
    });
    this.hide();
  }

  receive(names: readonly string[]): void {
    if (!this.input.isConnected) {
      return;
    }
    this.names = names;
    this.filter();
  }

  name(): string {
    return this.input.value.trim()
      ? (this.choices[this.selected] ?? this.input.value.trim())
      : "";
  }

  move(direction: number): void {
    if (!this.choices.length) {
      return;
    }
    this.selected =
      (this.selected + direction + this.choices.length) % this.choices.length;
    this.render();
  }

  hide(): void {
    this.popup.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  private filter(): void {
    this.choices = propertyNameSuggestions(this.names, this.input.value);
    this.selected = 0;
    this.render();
  }

  private render(): void {
    this.popup.replaceChildren();
    this.popup.hidden =
      !this.choices.length ||
      this.input.ownerDocument.activeElement !== this.input;
    this.input.setAttribute("aria-expanded", String(!this.popup.hidden));
    this.choices.forEach((name, index) => {
      const option = this.input.ownerDocument.createElement("div");
      option.id = `${this.popup.id}-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this.selected));
      option.textContent = name;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selected = index;
        this.input.value = name;
        this.accept();
      });
      this.popup.append(option);
    });
    const active = this.popup.children[this.selected];
    if (active && !this.popup.hidden) {
      this.input.setAttribute("aria-activedescendant", active.id);
    }
  }
}
