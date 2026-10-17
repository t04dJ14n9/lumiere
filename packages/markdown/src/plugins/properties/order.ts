import type { PropertyContext } from "./context";
import { EdgeScroll, type PointerPoint } from "../../webview/ui/edge-scroll";
import { placePropertyRows, propertyRows } from "./rows";
import type { MenuItem } from "../editor/api";

interface OrderActions {
  commit(keys: string[]): boolean;
  add(): void;
  clear(): void;
  report(message: string): void;
}
interface Drag {
  pointer: number;
  start: PointerPoint;
  grab: PointerPoint;
  row: HTMLElement;
  keys: string[];
  moved: boolean;
  ghost?: HTMLElement;
}

/** Sorting changes the displayed order; a drop commits the resulting key order. */
export class PropertyOrder {
  private source = "";
  private displayed?: string[];
  private drag?: Drag;
  private gesture?: AbortController;
  private readonly events = new AbortController();
  private readonly scroll: EdgeScroll;
  private readonly list: HTMLElement;
  private closeMenu?: () => void;
  private suppressClick = false;
  private clickTimer?: number;

  constructor(
    private readonly panel: HTMLElement,
    viewport: HTMLElement,
    private readonly openMenu: PropertyContext["openMenu"],
    private readonly actions: OrderActions,
  ) {
    this.list = panel.querySelector(".metadata-properties")!;
    this.scroll = new EdgeScroll(viewport, this.list, (point) =>
      this.preview(point),
    );
    panel.addEventListener("pointerdown", (event) => this.begin(event), {
      capture: true,
      signal: this.events.signal,
    });
    panel.addEventListener(
      "click",
      (event) => {
        if (this.suppressClick) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { capture: true, signal: this.events.signal },
    );
    this.registerHeadingMenu();
  }

  private registerHeadingMenu(): void {
    const heading = this.panel.querySelector<HTMLElement>(
      "[data-properties-heading]",
    )!;
    const menu = (point: PointerPoint): void => {
      this.closeMenu?.();
      this.closeMenu = this.openMenu(
        this.panel,
        propertyHeadingMenu({
          add: () => this.actions.add(),
          sort: (reverse) => this.sort(reverse),
          clear: () => this.actions.clear(),
        }),
        point,
        (message) => this.actions.report(message),
        "Properties",
      );
    };
    heading.addEventListener(
      "contextmenu",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        menu({ x: event.clientX, y: event.clientY });
      },
      { signal: this.events.signal },
    );
    heading.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
          const bounds = heading.getBoundingClientRect();
          menu({ x: bounds.left, y: bounds.bottom });
        }
      },
      { signal: this.events.signal },
    );
  }

  refresh(source: string): void {
    if (source !== this.source) {
      this.cancel(false);
      delete this.displayed;
      this.closeMenu?.();
      this.source = source;
    } else {
      if (this.drag && !this.drag.row.isConnected) {
        this.cancel();
      }
      if (this.displayed && !this.drag) {
        this.place(this.displayed);
      }
    }
  }

  private keys(): string[] {
    return propertyRows(this.panel).map((row) => row.dataset.propertyRow!);
  }

  private place(keys: readonly string[]): void {
    const rows = propertyRows(this.panel);
    const byKey = new Map(rows.map((row) => [row.dataset.propertyRow!, row]));
    const ordered = keys.flatMap((key) => byKey.get(key) ?? []);
    if (ordered.length !== rows.length) {
      return;
    }
    const focused = rows.find((row) => row.contains(document.activeElement));
    const pending = [
      ...this.list.querySelectorAll<HTMLElement>("[data-property-new]"),
    ];
    const activePending = pending.find((row) =>
      row.contains(document.activeElement),
    );
    placePropertyRows(
      this.list,
      [...ordered, ...pending],
      focused ?? activePending,
    );
  }

  private sort(reverse: boolean): void {
    this.cancel();
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true,
    });
    this.displayed = this.keys().sort(
      (left, right) => (reverse ? -1 : 1) * collator.compare(left, right),
    );
    this.place(this.displayed);
    this.panel
      .querySelector<HTMLElement>("[data-properties-heading]")!
      .focus({ preventScroll: true });
  }

  private begin(event: PointerEvent): void {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button[data-property-type]")
        : null;
    if (
      !button ||
      button.disabled ||
      event.button !== 0 ||
      !event.isPrimary ||
      event.altKey ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.keys().length < 2
    ) {
      return;
    }
    this.cancel();
    const row = button.closest<HTMLElement>("[data-property-row]")!;
    const bounds = row.getBoundingClientRect();
    this.drag = {
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      grab: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      row,
      keys: this.keys(),
      moved: false,
    };
    this.gesture = new AbortController();
    const options = { signal: this.gesture.signal };
    // Keep an active value draft connected and focused while a grip is held.
    event.preventDefault();
    window.addEventListener(
      "pointermove",
      (event) => this.moveDrag(event, bounds.width),
      options,
    );
    window.addEventListener("pointerup", (event) => this.drop(event), options);
    this.registerGestureCancellation(options);
  }

  private moveDrag(move: PointerEvent, width: number): void {
    const drag = this.drag;
    if (!drag || move.pointerId !== drag.pointer) {
      return;
    }
    if (
      !drag.moved &&
      Math.hypot(move.clientX - drag.start.x, move.clientY - drag.start.y) < 10
    ) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      this.panel.setPointerCapture(drag.pointer);
      const ghost = document.createElement("div");
      ghost.className = "property-drag-ghost";
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.style.width = `${width}px`;
      ghost.style.font = getComputedStyle(drag.row).font;
      ghost.append(drag.row.cloneNode(true));
      (this.panel.closest(".cm-editor") ?? document.body).append(ghost);
      drag.ghost = ghost;
      drag.row.classList.add("property-drag-placeholder");
    }
    move.preventDefault();
    this.scroll.move({ x: move.clientX, y: move.clientY });
  }

  private drop(up: PointerEvent): void {
    const drag = this.drag;
    if (!drag || up.pointerId !== drag.pointer) {
      return;
    }
    if (drag.moved) {
      this.preview({ x: up.clientX, y: up.clientY });
    }
    const keys = this.keys();
    this.cancel(false);
    if (drag.moved) {
      if (!this.actions.commit(keys)) {
        this.place(drag.keys);
      }
    }
  }

  private registerGestureCancellation(options: { signal: AbortSignal }): void {
    const cancelPointer = (cancel: PointerEvent): void => {
      if (cancel.pointerId === this.drag?.pointer) {
        this.cancel();
      }
    };
    window.addEventListener("pointercancel", cancelPointer, options);
    this.panel.addEventListener("lostpointercapture", cancelPointer, options);
    window.addEventListener("blur", () => this.cancel(), options);
    window.addEventListener(
      "keydown",
      (key) => {
        if (key.key === "Escape" && this.drag) {
          key.preventDefault();
          key.stopPropagation();
          this.cancel();
        }
      },
      { ...options, capture: true },
    );
  }

  private preview(point: PointerPoint): void {
    const drag = this.drag;
    if (!drag?.moved) {
      return;
    }
    if (!drag.row.isConnected) {
      this.cancel();
      return;
    }
    const rows = propertyRows(this.panel);
    const middle =
      point.y - drag.grab.y + drag.row.getBoundingClientRect().height / 2;
    const from = rows.indexOf(drag.row);
    const others = rows.filter((row) => row !== drag.row);
    // Moving a short row past a tall row changes the tall row's bottom edge.
    // Compare centers so that the unchanged pointer cannot reverse that move.
    const at = others.findIndex((row, index) => {
      const bounds = row.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      return index < from ? middle <= center : middle < center;
    });
    const index = at < 0 ? others.length : at;
    if (index !== from) {
      others.splice(index, 0, drag.row);
      this.place(others.map((row) => row.dataset.propertyRow!));
    }
    if (drag.ghost) {
      drag.ghost.style.left = `${point.x - drag.grab.x}px`;
      drag.ghost.style.top = `${point.y - drag.grab.y}px`;
    }
  }

  private cancel(restore = true): void {
    const drag = this.drag;
    delete this.drag;
    this.scroll.stop();
    this.gesture?.abort();
    delete this.gesture;
    if (drag) {
      if (this.panel.hasPointerCapture(drag.pointer)) {
        this.panel.releasePointerCapture(drag.pointer);
      }
      drag.row.classList.remove("property-drag-placeholder");
      drag.ghost?.remove();
      if (restore) {
        this.place(drag.keys);
      }
      if (drag.moved) {
        this.suppressClick = true;
        clearTimeout(this.clickTimer);
        this.clickTimer = window.setTimeout(() => {
          this.suppressClick = false;
        }, 0);
      }
    }
  }

  destroy(): void {
    this.cancel(false);
    clearTimeout(this.clickTimer);
    this.scroll.destroy();
    this.closeMenu?.();
    this.events.abort();
  }
}

export function propertyHeadingMenu(actions: {
  add(): void;
  sort(reverse: boolean): void;
  clear(): void;
}): MenuItem[] {
  return [
    { label: "Add file property", run: () => actions.add() },
    {
      label: "Sort",
      children: [
        { label: "Name (A to Z)", run: () => actions.sort(false) },
        { label: "Name (Z to A)", run: () => actions.sort(true) },
      ],
    },
    { label: "Clear file properties", run: () => actions.clear() },
  ];
}
