import type { TableEnvironment } from "./environment";
import { forwardTableWheel } from "./wheel-scroll";

/** Grid selection and a focused table root are the only wheel-forwarding cases. */
export function tableForwardsWheel(state: {
  cellOpen: boolean;
  gridRange: boolean;
  rootFocused: boolean;
}): boolean {
  return !state.cellOpen && (state.gridRange || state.rootFocused);
}

/**
 * Owns the table's non-passive wheel listener.
 *
 * Chromium blocks the compositor on every wheel event over an element that
 * has a non-passive wheel listener. The listener exists only while grid
 * selection or direct table focus needs `forwardTableWheel` to keep vertical
 * input on the note. Hovering a table, or editing a cell, scrolls natively.
 */
export class TableWheelGate {
  private listener?: (event: WheelEvent) => void;

  constructor(
    private readonly root: HTMLElement,
    signal: AbortSignal,
    private readonly read: {
      viewport: () => HTMLElement;
      lineHeight: () => number;
      scrollNote: TableEnvironment["scrollNote"];
      shouldForward: () => boolean;
    },
  ) {
    signal.addEventListener("abort", () => this.detach());
  }

  sync(): void {
    if (this.read.shouldForward()) {
      this.attach();
      return;
    }
    this.detach();
  }

  private attach(): void {
    if (this.listener) {
      return;
    }
    const listener = (event: WheelEvent): void => {
      forwardTableWheel(
        event,
        this.read.viewport(),
        this.read.lineHeight(),
        this.read.scrollNote,
      );
    };
    this.root.addEventListener("wheel", listener, { passive: false });
    this.listener = listener;
  }

  private detach(): void {
    if (!this.listener) {
      return;
    }
    this.root.removeEventListener("wheel", this.listener);
    delete this.listener;
  }
}
