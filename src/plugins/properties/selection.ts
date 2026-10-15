import { stringify } from "yaml";
import { clipboardProperties } from "./clipboard-values";

interface PropertySelectionActions {
  values(): Record<string, unknown>;
  remove(keys: string[]): boolean;
  merge(values: Record<string, unknown>): void;
}

/** Row selection stays separate from the native selection inside an input. */
export class PropertySelection {
  private readonly selected = new Set<string>();

  constructor(
    private readonly panel: HTMLElement,
    private readonly actions: PropertySelectionActions,
  ) {
    panel.addEventListener("focusin", (event) => {
      if (!this.rows().includes(event.target as HTMLElement)) {
        this.clear();
      }
    });
    this.registerPointerSelection();
    panel.addEventListener("keydown", (event) => this.keydown(event), true);
    this.registerPaste();
    this.registerCopy();
  }

  private registerPointerSelection(): void {
    this.panel.addEventListener(
      "mousedown",
      (event) => {
        const row =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-property-row]")
            : null;
        if (
          ((event.altKey || event.shiftKey) && selectableRow(event)) ||
          (event.button === 2 && row && this.has(row))
        ) {
          event.preventDefault();
        }
      },
      true,
    );
    this.panel.addEventListener(
      "click",
      (event) => {
        const row = selectableRow(event);
        if (!row) {
          return;
        }
        const rows = this.rows();
        const focused = rows.indexOf(document.activeElement as HTMLElement);
        const index = rows.indexOf(row);
        if (event.shiftKey) {
          const from = focused < 0 ? index : focused;
          const remove = this.has(rows[from]!) && this.has(row);
          for (const item of rows.slice(
            Math.min(from, index),
            Math.max(from, index) + 1,
          )) {
            this.toggle(item, !remove);
          }
        } else if (event.altKey) {
          this.toggle(row, !this.has(row));
        } else {
          this.clear();
          return;
        }
        row.focus({ preventScroll: true });
        this.sync();
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  }
  private registerPaste(): void {
    this.panel.addEventListener("paste", (event) => {
      const data = event.clipboardData?.getData("obsidian/properties");
      if (!data) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        const values: unknown = JSON.parse(data);
        if (values && typeof values === "object" && !Array.isArray(values)) {
          this.actions.merge(values as Record<string, unknown>);
        }
      } catch {
        // A malformed structured payload must not fall through into note text.
      }
    });
  }
  private registerCopy(): void {
    for (const type of ["copy", "cut"] as const) {
      this.panel.addEventListener(type, (event) => {
        if (
          !this.rows().includes(document.activeElement as HTMLElement) ||
          !event.clipboardData
        ) {
          return;
        }
        // Selected Sources ids (and other in-row text) must copy natively.
        const native = this.panel.ownerDocument.getSelection();
        if (native && !native.isCollapsed && native.toString().length > 0) {
          return;
        }
        const keys = this.keys(document.activeElement as HTMLElement);
        const values = this.values(keys);
        if (!keys.length) {
          return;
        }
        event.clipboardData.setData("text/plain", stringify(values));
        event.clipboardData.setData(
          "obsidian/properties",
          JSON.stringify(values),
        );
        event.preventDefault();
        event.stopPropagation();
        if (type === "cut") {
          this.remove(keys);
        }
      });
    }
  }

  private rows(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>("[data-property-row]")];
  }

  private has(row: HTMLElement): boolean {
    return this.selected.has(row.dataset.propertyRow!);
  }

  private toggle(row: HTMLElement, selected: boolean): void {
    const key = row.dataset.propertyRow!;
    if (selected) {
      this.selected.add(key);
    } else {
      this.selected.delete(key);
    }
  }

  keys(fallback?: HTMLElement): string[] {
    const keys = this.rows()
      .filter((row) => this.has(row))
      .map((row) => row.dataset.propertyRow!);
    if (keys.length) {
      return keys;
    }
    return fallback ? [fallback.dataset.propertyRow!] : [];
  }

  private values(keys: string[]): Record<string, unknown> {
    const values = this.actions.values();
    return Object.fromEntries(
      keys
        .filter((key) => Object.hasOwn(values, key))
        .map((key) => [key, values[key]]),
    );
  }

  copy(keys: readonly string[]): boolean {
    const rows = this.rows().filter((row) =>
      keys.includes(row.dataset.propertyRow!),
    );
    if (!this.panel.isConnected || !rows.length) {
      return false;
    }
    this.selected.clear();
    rows.forEach((row) => this.selected.add(row.dataset.propertyRow!));
    rows[0]!.focus({ preventScroll: true });
    this.sync();
    // The native copy event supplies both YAML and structured properties.
    return this.panel.ownerDocument.execCommand("copy");
  }

  cut(keys: string[]): boolean {
    if (!this.copy(keys)) {
      return false;
    }
    this.remove(keys);
    return true;
  }

  paste(text: string): void {
    const values = clipboardProperties(text);
    if (values) {
      this.actions.merge(values);
    }
  }

  remove(keys: string[]): void {
    if (this.actions.remove(keys)) {
      this.clear();
    }
  }

  clear(): void {
    this.selected.clear();
    this.sync();
  }

  sync(): void {
    const rows = this.rows();
    const valid = new Set(rows.map((row) => row.dataset.propertyRow!));
    for (const key of this.selected) {
      if (!valid.has(key)) {
        this.selected.delete(key);
      }
    }
    for (const row of rows) {
      row.toggleAttribute("data-property-selected", this.has(row));
    }
  }

  private keydown(event: KeyboardEvent): void {
    const rows = this.rows();
    const index = rows.indexOf(event.target as HTMLElement);
    if (index < 0 || event.isComposing || event.defaultPrevented) {
      return;
    }
    const row = rows[index]!;
    const mod = event.metaKey || event.ctrlKey;
    if (event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      this.extendKeyboardSelection(
        rows,
        index,
        event.key === "ArrowDown" ? 1 : -1,
      );
    } else if (mod && event.key.toLowerCase() === "a") {
      rows.forEach((row) => this.toggle(row, true));
    } else if (event.key === "Delete") {
      this.remove(this.keys(row));
    } else {
      this.handleUnselectedKey(event);
      return;
    }
    this.sync();
    event.preventDefault();
    event.stopPropagation();
  }
  private extendKeyboardSelection(
    rows: HTMLElement[],
    index: number,
    direction: number,
  ): void {
    const row = rows[index]!;
    const next = rows[index + direction];
    if (next) {
      if (this.has(row) && this.has(next)) {
        this.toggle(row, false);
      } else {
        this.toggle(row, true);
        this.toggle(next, true);
      }
      next.focus();
    }
  }

  private handleUnselectedKey(event: KeyboardEvent): void {
    if (
      ["ArrowUp", "ArrowDown", "Tab", "j", "k", "Escape"].includes(event.key)
    ) {
      this.clear();
    } else if (
      this.selected.size > 1 &&
      ["Enter", " ", "ArrowLeft", "ArrowRight", "h", "l", "i", "A"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}

function selectableRow(event: MouseEvent): HTMLElement | undefined {
  if (!(event.target instanceof Element)) {
    return;
  }
  const row = event.target.closest<HTMLElement>("[data-property-row]");
  if (
    row &&
    (event.target === row ||
      event.target.closest("[data-property-type]") ||
      ["DT", "DD"].includes(event.target.tagName))
  ) {
    return row;
  }
  return undefined;
}
