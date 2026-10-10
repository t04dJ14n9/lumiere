import type { PropertyScalar } from "../../markdown/properties";
import type { ChipActions } from "./chip-actions";
import { itemOccurrence } from "./chip-values";

interface ChipDraftOptions {
  chip: HTMLElement;
  list: HTMLElement;
  add: HTMLElement;
  key: string;
  index: number;
  original: readonly PropertyScalar[];
  actions: ChipActions;
  currentList(): HTMLElement | null;
  focus(index: number): void;
}

/** A draft follows one occurrence through concurrent changes to the list. */
export class ChipDraft {
  private readonly input = document.createElement("input");
  private readonly initial: string;
  private active = true;

  constructor(private readonly options: ChipDraftOptions) {
    const { key, index, original, chip } = options;
    this.initial = String(original[index] ?? "");
    this.input.type = "text";
    this.input.className = "property-chip-input";
    this.input.dataset.propertyChipEdit = String(index);
    this.input.dataset.propertyEditing = "true";
    this.input.setAttribute("aria-label", `Edit item ${index + 1} in ${key}`);
    this.input.value = this.initial;
    this.registerEvents();
    chip.replaceWith(this.input);
    this.input.focus();
    this.input.select();
  }

  private cancel(refocus: boolean): void {
    this.active = false;
    delete this.input.dataset.propertyEditing;
    this.input.replaceWith(this.options.chip);
    if (refocus) {
      this.options.chip.focus();
    }
    this.options.actions.refresh();
  }

  private commit(refocus = false): boolean {
    if (!this.active) {
      return true;
    }
    if (!this.input.value.trim() || this.input.value === this.initial) {
      this.cancel(refocus);
      return true;
    }
    const { actions, original, index } = this.options;
    const value = actions.value(this.input);
    const latest = actions.values();
    if (value === undefined || !latest) {
      return false;
    }
    const indexNow = itemOccurrence(original, latest, index);
    if (!this.validateReplacement(latest, value, indexNow)) {
      return false;
    }
    const next = [...latest];
    next[indexNow] = value;
    this.active = false;
    this.input.dataset.propertyCommitting = "true";
    const applied = actions.update(next, false);
    delete this.input.dataset.propertyCommitting;
    if (!applied) {
      this.active = true;
      return false;
    }
    if (refocus) {
      this.options.focus(indexNow);
    }
    return true;
  }

  private validateReplacement(
    latest: PropertyScalar[],
    value: string,
    index: number,
  ): boolean {
    if (
      index >= 0 &&
      !latest.some((item, at) => at !== index && item === value)
    ) {
      return true;
    }
    this.input.setCustomValidity(
      index < 0
        ? "This item changed in another editor. Press Escape to use the current list."
        : "This item is already in the list.",
    );
    this.input.reportValidity();
    return false;
  }

  private registerEvents(): void {
    this.input.addEventListener("input", () =>
      this.input.setCustomValidity(""),
    );
    this.input.addEventListener("blur", (event) => this.commitOnBlur(event));
    this.input.addEventListener("property-commit", (event) => {
      if (!this.commit()) {
        event.preventDefault();
      }
    });
    this.input.addEventListener("keydown", (event) => this.keyDown(event));
  }

  private commitOnBlur(event: FocusEvent): void {
    const { list, actions, original, add, focus, currentList } = this.options;
    const target = event.relatedTarget;
    const next =
      target instanceof HTMLElement && list.contains(target)
        ? target.closest<HTMLElement>("[data-property-chip]")
        : undefined;
    if (
      !this.commit() ||
      !(target instanceof HTMLElement) ||
      target.isConnected
    ) {
      return;
    }
    // Committing can replace the list DOM while focus is moving to another chip.
    const latest = actions.values();
    const at =
      next && latest
        ? itemOccurrence(original, latest, Number(next.dataset.propertyChip))
        : -1;
    if (at >= 0) {
      focus(at);
    } else if (target === add) {
      currentList()
        ?.querySelector<HTMLElement>("[data-property-list-input]")
        ?.focus();
    }
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (this.commit()) {
        this.options.actions.action("save");
      }
      return;
    }
    if (!["Enter", "Escape"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      this.cancel(true);
    } else if (this.input.value.trim()) {
      this.commit(true);
    }
  }
}
