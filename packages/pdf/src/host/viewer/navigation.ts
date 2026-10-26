import type { HostMessage } from "../../shared/messages";
import type { PdfLocation } from "../../shared/pdf-location";
import type { ViewerAction } from "../../shared/view-state";

/**
 * Where the reader is sent: pages, boxes and view actions for one editor.
 *
 * Invariant: nothing is sent to a viewer that does not have the PDF yet. A
 * location asked for earlier waits (only the latest is kept) and is sent
 * right after the bytes; view actions asked for earlier are dropped, since
 * they act on a view that does not exist yet.
 */
export class PdfNavigation {
  private loaded = false;
  private pending:
    | { location: PdfLocation; top?: number | undefined; requestId?: number }
    | undefined;

  constructor(private readonly post: (message: HostMessage) => void) {}

  /** Show a page (and box), or with no box the page from `top` points below its top. */
  goTo(location: PdfLocation, top?: number, requestId?: number): void {
    const target = {
      location,
      top,
      ...(requestId === undefined ? {} : { requestId }),
    };
    if (this.loaded) {
      this.post({ type: "goTo", ...target });
    } else {
      this.pending = target;
    }
  }

  cancel(): void {
    this.pending = undefined;
  }

  act(action: ViewerAction): void {
    if (this.loaded) {
      this.post({ type: "action", action });
    }
  }

  /** The viewer is about to receive new bytes. */
  unload(): void {
    this.loaded = false;
  }

  /** The viewer has the bytes: send the location that was waiting. */
  loadedNow(): void {
    this.loaded = true;
    if (!this.pending) {
      return;
    }
    this.post({ type: "goTo", ...this.pending });
    this.pending = undefined;
  }
}
