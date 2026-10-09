import DOMPurify from "dompurify";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import { markdownFromHtml } from "./conversion";
import { acceptsHtml, pasteTransformed } from "./paste";
export const pasteHtmlWebview: Plugin = {
  name: "pasteHtml",
  inject: { required: ["editor"] },
  apply(ctx) {
    registerHtmlTransform(ctx);
    registerPasteCapture(ctx);
  },
};
function registerHtmlTransform(ctx: Context): void {
  ctx.on("paste/transform", (data) => {
    if (!data.html) {
      return data;
    }
    const clean = DOMPurify.sanitize(data.html, {
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
      ADD_TAGS: ["annotation", "math", "mjx-container", "mrow", "semantics"],
      ADD_ATTR: ["data-display", "data-tex", "display", "encoding", "jax"],
    });
    return { text: markdownFromHtml(clean) ?? data.text, html: "" };
  });
}
function registerPasteCapture(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.define((outer) => {
        const events = new AbortController();
        let plain = false;
        outer.dom.addEventListener(
          "keydown",
          (event) => {
            plain =
              event.key.toLowerCase() === "v" &&
              event.shiftKey &&
              (event.metaKey || event.ctrlKey);
          },
          { capture: true, signal: events.signal },
        );
        outer.dom.addEventListener(
          "paste",
          (event) => {
            const bypass = plain;
            plain = false;
            const target = pasteView(event, outer);
            if (bypass || !target || !acceptsHtml(target.state)) {
              return;
            }
            // Rectangular table selections retain their TSV paste semantics.
            if (target === outer && ctx.bail("editor/projectSelection")) {
              return;
            }
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (!html.trim()) {
              return;
            }
            event.preventDefault();
            void pasteTransformed({
              view: target,
              data: {
                html,
                text: event.clipboardData?.getData("text/plain") ?? "",
              },
              transform: (data) => ctx.pipeline("paste/transform", data),
              isLive: () => !events.signal.aborted && target.dom.isConnected,
            }).catch((error) => ctx.logger.warn("Paste failed", error));
          },
          { capture: true, signal: events.signal },
        );
        return { destroy: () => events.abort() };
      }),
    ),
  );
}
function pasteView(
  event: ClipboardEvent,
  outer: EditorView,
): EditorView | undefined {
  if (
    event.defaultPrevented ||
    !(event.target instanceof HTMLElement) ||
    event.target.closest("input, textarea")
  ) {
    return undefined;
  }
  const target = EditorView.findFromDOM(event.target);
  return target && outer.dom.contains(target.dom) ? target : undefined;
}
