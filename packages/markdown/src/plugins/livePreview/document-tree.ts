import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
  parseForFirstPaint,
  replaceDocumentTree,
} from "./api";
import { DocumentParse } from "./document-parse";

export {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
  parseForFirstPaint,
  replaceDocumentTree,
};

/**
 * Characters past the viewport parsed together with it, so the next few
 * scroll steps find their syntax ready and do not each publish a tree.
 */
export const PARSE_AHEAD_CHARS = 10000;
/** The longest background slice; a shorter idle period ends it sooner. */
const IDLE_SLICE_MS = 5;
/** Run a slice at least this often, even while the page never idles. */
const IDLE_TIMEOUT_MS = 50;

/** Runs background slices; each gets a time budget in milliseconds. */
export interface IdleScheduler {
  request(slice: (budget: number) => void): () => void;
}

/** What the parser reads from and writes to its editor. */
export type ParsedView = Pick<EditorView, "state" | "viewport" | "dispatch">;

/**
 * Keeps Live Preview's tree of a large note ahead of the viewport and
 * finishes it in the background.
 *
 * While the tree is a prefix, a viewport that passes its end has the parse
 * resumed at once, up to the viewport and a margin: those lines need their
 * syntax this frame. The rest is parsed in short idle slices, scrolling or
 * not, and published when complete. An edit hands everything parsed so far
 * to the next document version, so nothing restarts from the top.
 */
export class DocumentTreeParser {
  private parse: DocumentParse;
  private cancelSlice: (() => void) | undefined;
  private isCatchUpQueued = false;
  private isDestroyed = false;

  constructor(
    private readonly view: ParsedView,
    private readonly scheduler: IdleScheduler = browserIdleScheduler(),
  ) {
    this.parse = DocumentParse.from(
      view.state.doc,
      view.state.field(documentTree),
    );
    this.keepUp();
  }

  update(update: ViewUpdate): void {
    const tree = update.state.field(documentTree);
    if (update.docChanged || tree !== this.parse.tree) {
      const fragments =
        this.parse.doc === update.startState.doc
          ? this.parse.fragmentsAfter(update.changes, update.state.doc)
          : [];
      this.parse = DocumentParse.from(update.state.doc, tree, fragments);
    }
    this.keepUp();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.cancelSlice?.();
    this.cancelSlice = undefined;
  }

  private keepUp(): void {
    if (this.parse.isComplete) {
      this.cancelSlice?.();
      this.cancelSlice = undefined;
      return;
    }
    if (this.view.viewport.to > this.parse.tree.length) {
      this.queueCatchUp();
    }
    this.scheduleSlice();
  }

  /** A view update cannot dispatch, so the catch-up runs right after it. */
  private queueCatchUp(): void {
    if (this.isCatchUpQueued) {
      return;
    }
    this.isCatchUpQueued = true;
    queueMicrotask(() => {
      this.isCatchUpQueued = false;
      this.catchUpWithViewport();
    });
  }

  private catchUpWithViewport(): void {
    const { to } = this.view.viewport;
    if (
      this.isDestroyed ||
      this.view.state.field(documentTree, false) !== this.parse.tree ||
      to <= this.parse.tree.length
    ) {
      return;
    }
    this.parse.coverTo(to + PARSE_AHEAD_CHARS);
    this.publish();
  }

  private scheduleSlice(): void {
    if (this.cancelSlice || this.isDestroyed) {
      return;
    }
    this.cancelSlice = this.scheduler.request((budget) => {
      this.cancelSlice = undefined;
      if (this.isDestroyed || this.parse.isComplete) {
        return;
      }
      if (this.parse.work(performance.now() + budget)) {
        this.publish();
      } else {
        this.scheduleSlice();
      }
    });
  }

  private publish(): void {
    this.view.dispatch({ effects: replaceDocumentTree.of(this.parse.tree) });
  }
}

/** Idle callbacks where the browser has them; short timeouts otherwise. */
function browserIdleScheduler(): IdleScheduler {
  if (typeof requestIdleCallback === "function") {
    return {
      request(slice) {
        const handle = requestIdleCallback(
          (deadline) =>
            slice(
              deadline.didTimeout
                ? IDLE_SLICE_MS
                : Math.min(IDLE_SLICE_MS, deadline.timeRemaining()),
            ),
          { timeout: IDLE_TIMEOUT_MS },
        );
        return () => cancelIdleCallback(handle);
      },
    };
  }
  return {
    request(slice) {
      const handle = setTimeout(() => slice(IDLE_SLICE_MS), 0);
      return () => clearTimeout(handle);
    },
  };
}

export const documentTreeParser = ViewPlugin.fromClass(DocumentTreeParser);
