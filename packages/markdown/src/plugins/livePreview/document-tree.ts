import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { parseMarkdown } from "../../markdown/dialect";
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

/**
 * After the first frame, finish the full-document tree when create() only
 * parsed the opening band. Public CM6 pattern: cheap first paint, then
 * `ensure`-style completion off the critical path.
 */
export const documentTreeCompleter = ViewPlugin.fromClass(
  class {
    private done = false;
    constructor(view: EditorView) {
      // Defer past the first paint frame so full-doc Lezer work cannot contend
      // with glyphs (#289: growing sync first-paint parse regressed TTI).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.schedule(view));
      });
    }
    update(update: ViewUpdate) {
      if (this.done) {
        return;
      }
      if (update.state.field(documentTree).length >= update.state.doc.length) {
        this.done = true;
        return;
      }
      if (update.docChanged) {
        this.schedule(update.view);
      }
    }
    private schedule(view: EditorView) {
      const run = () => {
        if (!view.dom.isConnected || this.done) {
          return;
        }
        const current = view.state.field(documentTree);
        if (current.length >= view.state.doc.length) {
          this.done = true;
          return;
        }
        const full = parseMarkdown(view.state.doc);
        this.done = true;
        view.dispatch({ effects: replaceDocumentTree.of(full) });
      };
      const idle = (
        globalThis as unknown as {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback;
      if (typeof idle === "function") {
        // After first paint, finish soon — heading reveal via the
        // Frontmatter placeholder waits on a complete fence node.
        idle(run, { timeout: 32 });
      } else {
        requestAnimationFrame(() => requestAnimationFrame(run));
      }
    }
  },
);
