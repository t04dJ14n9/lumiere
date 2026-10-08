import type { PropertyContext } from "./context";
import type { PropertyScalar } from "../../markdown/properties";

export function itemOccurrence(
  original: readonly PropertyScalar[],
  latest: readonly PropertyScalar[],
  index: number,
): number {
  const selected = original[index];
  let occurrence = original
    .slice(0, index)
    .filter((value) => Object.is(value, selected)).length;
  return latest.findIndex(
    (value) => Object.is(value, selected) && occurrence-- === 0,
  );
}

interface ChipActions {
  editable: boolean;
  values(): PropertyScalar[] | undefined;
  value(input: HTMLInputElement): string | undefined;
  update(values: PropertyScalar[], refocus: boolean): boolean;
  remove(index: number, previous?: boolean): void;
  refresh(): void;
  copy(text: string): void;
  action(action: "save" | "undo" | "redo"): void;
}

/** A chip editor changes one occurrence in the latest list, never a stale list. */
export function bindPropertyChips(
  container: HTMLElement,
  list: HTMLElement,
  key: string,
  original: readonly PropertyScalar[],
  actions: ChipActions,
  openMenu: PropertyContext["openMenu"],
): () => void {
  let closeMenu: (() => void) | undefined;
  const add = list.querySelector<HTMLInputElement>("input")!;
  const chips = [...list.querySelectorAll<HTMLElement>("[data-property-chip]")];
  const currentList = (): HTMLElement | null =>
    container.querySelector(`[data-property-list="${CSS.escape(key)}"]`);
  const focus = (index: number): void => {
    const current = currentList();
    const chip = current?.querySelector<HTMLElement>(
      `[data-property-chip="${Math.max(0, index)}"]`,
    );
    (chip ?? current?.querySelector<HTMLInputElement>("input"))?.focus();
  };
  const edit = (index: number): void => {
    if (!actions.editable) {
      return;
    }
    const chip = chips[index]!;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "property-chip-input";
    input.dataset.propertyChipEdit = String(index);
    input.dataset.propertyEditing = "true";
    input.setAttribute("aria-label", `Edit item ${index + 1} in ${key}`);
    const initial = String(original[index] ?? "");
    input.value = initial;
    let active = true;
    const cancel = (refocus: boolean): void => {
      active = false;
      delete input.dataset.propertyEditing;
      input.replaceWith(chip);
      if (refocus) {
        chip.focus();
      }
      actions.refresh();
    };
    const commit = (refocus = false): boolean => {
      if (!active) {
        return true;
      }
      if (!input.value.trim() || input.value === initial) {
        cancel(refocus);
        return true;
      }
      const value = actions.value(input);
      const latest = actions.values();
      if (value === undefined || !latest) {
        return false;
      }
      const indexNow = itemOccurrence(original, latest, index);
      if (
        indexNow < 0 ||
        latest.some((item, at) => at !== indexNow && item === value)
      ) {
        input.setCustomValidity(
          indexNow < 0
            ? "This item changed in another editor. Press Escape to use the current list."
            : "This item is already in the list.",
        );
        input.reportValidity();
        return false;
      }
      const next = [...latest];
      next[indexNow] = value;
      active = false;
      input.dataset.propertyCommitting = "true";
      const applied = actions.update(next, false);
      delete input.dataset.propertyCommitting;
      if (!applied) {
        active = true;
        return false;
      }
      if (refocus) {
        focus(indexNow);
      }
      return true;
    };
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("blur", (event) => {
      const target = event.relatedTarget;
      const next =
        target instanceof HTMLElement && list.contains(target)
          ? target.closest<HTMLElement>("[data-property-chip]")
          : undefined;
      if (commit() && target instanceof HTMLElement && !target.isConnected) {
        const latest = actions.values();
        const at =
          next && latest
            ? itemOccurrence(
                original,
                latest,
                Number(next.dataset.propertyChip),
              )
            : -1;
        if (at >= 0) {
          focus(at);
        } else if (target === add) {
          currentList()?.querySelector<HTMLInputElement>("input")?.focus();
        }
      }
    });
    input.addEventListener("property-commit", (event) => {
      if (!commit()) {
        event.preventDefault();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (commit()) {
          actions.action("save");
        }
        return;
      }
      if (!["Enter", "Escape"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        cancel(true);
      } else if (input.value.trim()) {
        commit(true);
      }
    });
    chip.replaceWith(input);
    input.focus();
    input.select();
  };
  chips.forEach((chip, index) => {
    const copy = (): string => String(original[index] ?? "");
    chip.addEventListener("copy", (event) => {
      if (document.activeElement === chip && event.clipboardData) {
        event.clipboardData.setData("text/plain", copy());
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
      edit(index);
    });
    const menu = (point: { x: number; y: number }): void => {
      closeMenu?.();
      chip.focus();
      closeMenu = openMenu(
        list,
        [
          {
            label: "Edit item",
            disabled: !actions.editable,
            run: () => edit(index),
          },
          { label: "Copy item", run: () => actions.copy(copy()) },
          {
            label: "Remove from list",
            disabled: !actions.editable,
            run: () => actions.remove(index),
          },
        ],
        point,
        (message) => {
          add.setCustomValidity(message);
          add.reportValidity();
        },
        "List item actions",
      );
    };
    chip.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu({ x: event.clientX, y: event.clientY });
    });
    chip.addEventListener("keydown", (event) => {
      if (event.target !== chip || event.isComposing) {
        return;
      }
      const destinations: Record<string, number> = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        ArrowUp: 0,
        ArrowDown: chips.length,
        Escape: chips.length,
      };
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        actions.action(event.shiftKey ? "redo" : "undo");
      } else if (mod && event.key.toLowerCase() === "s") {
        actions.action("save");
      } else if (event.key === "Enter") {
        edit(index);
      } else if (event.key === "Backspace" && actions.editable) {
        actions.remove(index, true);
      } else if (Object.hasOwn(destinations, event.key)) {
        focus(destinations[event.key]!);
      } else if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        const bounds = chip.getBoundingClientRect();
        menu({ x: bounds.left, y: bounds.bottom });
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });
  });
  add.addEventListener("keydown", (event) => {
    if (
      !event.isComposing &&
      !add.value &&
      ["ArrowLeft", "Backspace"].includes(event.key) &&
      chips.length
    ) {
      event.preventDefault();
      event.stopPropagation();
      focus(chips.length - 1);
    }
  });
  return () => closeMenu?.();
}
