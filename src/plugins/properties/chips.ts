import type { PropertyContext } from "./context";
import type { PropertyScalar } from "../../markdown/properties";
import type { ChipActions } from "./chip-actions";
import { ChipDraft } from "./chip-draft";
export { itemOccurrence } from "./chip-values";

export interface PropertyChipsOptions {
  container: HTMLElement;
  list: HTMLElement;
  key: string;
  original: readonly PropertyScalar[];
  actions: ChipActions;
  openMenu: PropertyContext["openMenu"];
}

/** Chip focus, menu and clipboard bindings; drafts have their own lifetime. */
export function bindPropertyChips(options: PropertyChipsOptions): () => void {
  const bindings = new PropertyChips(options);
  return () => bindings.close();
}

class PropertyChips {
  private closeMenu?: () => void;
  private readonly add: HTMLInputElement;
  private readonly chips: HTMLElement[];

  constructor(private readonly options: PropertyChipsOptions) {
    this.add = options.list.querySelector<HTMLInputElement>("input")!;
    this.chips = [
      ...options.list.querySelectorAll<HTMLElement>("[data-property-chip]"),
    ];
    this.chips.forEach((chip, index) => this.bindChip(chip, index));
    this.add.addEventListener("keydown", (event) => {
      if (
        !event.isComposing &&
        !this.add.value &&
        ["ArrowLeft", "Backspace"].includes(event.key) &&
        this.chips.length
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.focus(this.chips.length - 1);
      }
    });
  }

  private currentList(): HTMLElement | null {
    return this.options.container.querySelector(
      `[data-property-list="${CSS.escape(this.options.key)}"]`,
    );
  }

  private focus(index: number): void {
    const current = this.currentList();
    const chip = current?.querySelector<HTMLElement>(
      `[data-property-chip="${Math.max(0, index)}"]`,
    );
    (chip ?? current?.querySelector<HTMLInputElement>("input"))?.focus();
  }

  private edit(index: number): void {
    if (!this.options.actions.editable) {
      return;
    }
    new ChipDraft({
      list: this.options.list,
      key: this.options.key,
      original: this.options.original,
      actions: this.options.actions,
      chip: this.chips[index]!,
      index,
      add: this.add,
      currentList: () => this.currentList(),
      focus: (index) => this.focus(index),
    });
  }

  private bindChip(chip: HTMLElement, index: number): void {
    chip.addEventListener("copy", (event) => {
      if (document.activeElement === chip && event.clipboardData) {
        event.clipboardData.setData(
          "text/plain",
          String(this.options.original[index] ?? ""),
        );
        event.preventDefault();
        event.stopPropagation();
      }
    });
    chip.addEventListener("dblclick", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-property-remove]")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.edit(index);
    });
    chip.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.menu(index, { x: event.clientX, y: event.clientY });
    });
    chip.addEventListener("keydown", (event) => {
      if (
        event.target !== chip ||
        event.isComposing ||
        !this.keyDown(event, index)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });
  }

  private menu(index: number, point: { x: number; y: number }): void {
    const { actions, openMenu, list, original } = this.options;
    this.closeMenu?.();
    this.chips[index]!.focus();
    this.closeMenu = openMenu(
      list,
      [
        {
          label: "Edit item",
          disabled: !actions.editable,
          run: () => this.edit(index),
        },
        {
          label: "Copy item",
          run: () => actions.copy(String(original[index] ?? "")),
        },
        {
          label: "Remove from list",
          disabled: !actions.editable,
          run: () => actions.remove(index),
        },
      ],
      point,
      (message) => {
        this.add.setCustomValidity(message);
        this.add.reportValidity();
      },
      "List item actions",
    );
  }

  private keyDown(event: KeyboardEvent, index: number): boolean {
    const actions = this.options.actions;
    const destinations: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: 0,
      ArrowDown: this.chips.length,
      Escape: this.chips.length,
    };
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") {
      actions.action(event.shiftKey ? "redo" : "undo");
    } else if (mod && event.key.toLowerCase() === "s") {
      actions.action("save");
    } else if (event.key === "Enter") {
      this.edit(index);
    } else if (event.key === "Backspace" && actions.editable) {
      actions.remove(index, true);
    } else if (Object.hasOwn(destinations, event.key)) {
      this.focus(destinations[event.key]!);
    } else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      const bounds = this.chips[index]!.getBoundingClientRect();
      this.menu(index, { x: bounds.left, y: bounds.bottom });
    } else {
      return false;
    }
    return true;
  }

  close(): void {
    this.closeMenu?.();
  }
}
