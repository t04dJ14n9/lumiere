import type { HostMessage, ViewerMessage } from "../../shared/messages";
import type { PdfLocation } from "../../shared/pdf-location";
import type { HistorySnapshot } from "../../shared/pdf-history";
import type { ReadingPosition } from "../../shared/reading-position";

type Kind = "historyCaptured" | "historyRestored";
type Report = Extract<ViewerMessage, { type: Kind }>;

/** A viewer that does not answer in this time is treated as having refused. */
const ANSWER_TIMEOUT_MS = 10_000;

/**
 * The panel's history requests to its viewer: capture the reading position,
 * restore one, or go to a location. Each is answered once, by the viewer or
 * by a timeout. Request ids share one sequence with plain navigation, so the
 * newest request of either kind is known.
 */
export class HistoryRequests {
  private sequence = 0;
  /** Advanced for each new viewer page, whose answers are its own. */
  private incarnation = 0;
  private lastRestore: { token: number; incarnation: number } | undefined;
  private readonly pending = new Map<
    number,
    { kind: Kind; finish(snapshot?: HistorySnapshot): void }
  >();

  constructor(private readonly post: (message: HostMessage) => void) {}

  /** The newest request id. */
  get latest(): number {
    return this.sequence;
  }

  /** An id for a navigation that expects no answer. */
  nextId(): number {
    return ++this.sequence;
  }

  /** A new viewer page started. */
  newViewer(): void {
    this.incarnation++;
  }

  request(
    kind: Kind,
    position?: ReadingPosition,
    expectedIntent = 0,
    location?: PdfLocation,
  ): Promise<HistorySnapshot | undefined> {
    const token = ++this.sequence;
    if (kind === "historyRestored" && !location) {
      this.lastRestore = { token, incarnation: this.incarnation };
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (kind === "historyRestored") {
          this.post(
            location
              ? { type: "historyCancel" }
              : { type: "historyCancel", token },
          );
        }
        finish();
      }, ANSWER_TIMEOUT_MS);
      const finish = (result?: HistorySnapshot): void => {
        clearTimeout(timer);
        this.pending.delete(token);
        resolve(result);
      };
      this.pending.set(token, { kind, finish });
      this.post(requestMessage(token, expectedIntent, position, location));
    });
  }

  /** The viewer answered a request (about the bytes it shows now). */
  answer(message: Report): void {
    const request = this.pending.get(message.token);
    if (request?.kind !== message.type) {
      return;
    }
    if (!message.ok) {
      request.finish(undefined);
      return;
    }
    const restore = this.lastRestore;
    const sameViewer = restore?.incarnation === this.incarnation;
    request.finish({
      position: message.position,
      intent: message.intent,
      ...(message.startedToken !== undefined && restore && sameViewer
        ? { previousRestoreStarted: message.startedToken >= restore.token }
        : {}),
    });
  }

  /** Answer every open request with nothing. */
  cancelAll(): void {
    for (const request of [...this.pending.values()]) {
      request.finish();
    }
  }
}

/** What the viewer is asked for: go to a location, restore a position, or report one. */
function requestMessage(
  token: number,
  expectedIntent: number,
  position: ReadingPosition | undefined,
  location: PdfLocation | undefined,
): HostMessage {
  if (location) {
    return { type: "goTo", location, requestId: token, expectedIntent };
  }
  return position
    ? { type: "historyRestore", token, position, expectedIntent }
    : { type: "historyCapture", token };
}
