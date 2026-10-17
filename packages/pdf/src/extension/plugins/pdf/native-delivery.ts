import type { PdfLocation } from "../../../shared/pdf-location";
import type { HistorySnapshot } from "../../../shared/pdf-history";
import type { LinkRun } from "./source-links";

interface NativeDestination {
  prepareLocation():
    | { requestId: number; done: Promise<HistorySnapshot | undefined> }
    | undefined;
  revealLocation(
    location: PdfLocation,
    expectedIntent: number,
  ): { requestId: number; done: Promise<boolean> };
  cancelNavigation(requestId: number): void;
}

/** Keep source ownership until the exact renderer acknowledges a settled jump. */
export async function deliverNativeLocation(
  panel: NativeDestination,
  location: PdfLocation,
  run: LinkRun,
  cancellations: WeakMap<LinkRun, () => void>,
): Promise<void> {
  try {
    const captured = await readyPosition(panel, run, cancellations);
    if (!captured || !run.current()) {
      if (run.current()) {
        run.cancel();
      }
      return;
    }
    const request = panel.revealLocation(location, captured.intent);
    cancellations.set(run, () => panel.cancelNavigation(request.requestId));
    const applied = await request.done;
    cancellations.delete(run);
    if (!applied && run.current()) {
      run.cancel();
    }
  } finally {
    cancellations.delete(run);
  }
}

/** A cold viewer receives no location until it can capture its input generation. */
async function readyPosition(
  panel: NativeDestination,
  run: LinkRun,
  cancellations: WeakMap<LinkRun, () => void>,
): Promise<HistorySnapshot | undefined> {
  const deadline = Date.now() + 5000;
  while (run.current() && Date.now() < deadline) {
    const request = panel.prepareLocation();
    if (request) {
      cancellations.set(run, () => panel.cancelNavigation(request.requestId));
      const captured = await request.done;
      cancellations.delete(run);
      return captured;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  run.cancel();
  return undefined;
}
