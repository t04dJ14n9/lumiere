import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { markdownParser, rememberParsedMarkdown } from "../../markdown/dialect";
import {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
  parseForFirstPaint,
  replaceDocumentTree,
} from "./api";

export {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
  parseForFirstPaint,
  replaceDocumentTree,
};

const PARSE_SLICE_BUDGET_MS = 5;
const SCROLL_SETTLE_DELAY_MS = 120;

/**
 * After the first frame, finish the full-document tree when create() only
 * parsed the opening band. Uses time-sliced Lezer advancing so large documents
 * never block a scroll frame.
 */
export const documentTreeCompleter = ViewPlugin.fromClass(
  class {
    private done = false;
    private destroyed = false;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private lastScrollTime = 0;
    private readonly onScroll = () => {
      this.lastScrollTime = performance.now();
    };
    constructor(private readonly view: EditorView) {
      view.scrollDOM.addEventListener("scroll", this.onScroll, {
        passive: true,
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.schedule(view));
      });
    }
    update(update: ViewUpdate) {
      if (this.done || this.destroyed) {
        return;
      }
      if (update.state.field(documentTree).length >= update.state.doc.length) {
        this.done = true;
        this.clearTimer();
        return;
      }
      if (
        update.viewportChanged &&
        update.view.viewport.to > update.state.field(documentTree).length
      ) {
        this.clearTimer();
        this.done = true;
        const tree = markdownParser.parse(update.state.doc.toString());
        rememberParsedMarkdown(update.state.doc, tree);
        queueMicrotask(() => {
          if (!this.destroyed && update.view.dom.isConnected) {
            update.view.dispatch({ effects: replaceDocumentTree.of(tree) });
          }
        });
        return;
      }
      if (update.docChanged) {
        this.schedule(update.view);
      }
    }
    destroy() {
      this.destroyed = true;
      this.clearTimer();
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    }
    private clearTimer() {
      if (this.timer !== undefined) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    }
    private schedule(view: EditorView) {
      this.clearTimer();
      const targetDoc = view.state.doc;
      if (view.state.field(documentTree).length >= targetDoc.length) {
        this.done = true;
        return;
      }
      let partial: ReturnType<typeof markdownParser.startParse> | undefined;
      const step = () => {
        this.timer = undefined;
        if (this.destroyed || this.done || !view.dom.isConnected) {
          return;
        }
        if (view.state.doc !== targetDoc) {
          this.schedule(view);
          return;
        }
        if (view.state.field(documentTree).length >= targetDoc.length) {
          this.done = true;
          return;
        }
        const sinceScroll = performance.now() - this.lastScrollTime;
        if (this.lastScrollTime > 0 && sinceScroll < SCROLL_SETTLE_DELAY_MS) {
          this.timer = setTimeout(
            step,
            Math.max(16, SCROLL_SETTLE_DELAY_MS - sinceScroll),
          );
          return;
        }
        partial ??= markdownParser.startParse(targetDoc.toString());
        const deadline = performance.now() + PARSE_SLICE_BUDGET_MS;
        while (performance.now() < deadline) {
          const tree = partial.advance();
          if (tree) {
            rememberParsedMarkdown(targetDoc, tree);
            this.done = true;
            view.dispatch({ effects: replaceDocumentTree.of(tree) });
            return;
          }
        }
        this.timer = setTimeout(step, 0);
      };
      this.timer = setTimeout(step, 16);
    }
  },
);
