import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../resources/api";
import type {} from "../render/api";
import { protocol as links } from "../links/protocol";
import { linkPreviews } from "./controller";
export const pagePreviewWebview: Plugin = {
  name: "pagePreview",
  inject: { required: ["editor", "resources", "render", "rpc"] },
  apply(ctx) {
    registerPreviewTheme(ctx);
    registerPreviewController(ctx);
  },
};

function registerPreviewTheme(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      EditorView.baseTheme({
        ".link-preview": {
          position: "fixed",
          zIndex: "150",
          width: "min(420px, 80vw)",
          maxHeight: "350px",
          overflow: "auto",
          padding: "12px",
          background: "var(--vscode-editorHoverWidget-background)",
          border: "1px solid var(--vscode-editorHoverWidget-border)",
          boxShadow: "0 4px 14px #0004",
        },
      }),
    ),
  );
}

function registerPreviewController(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.fromClass(
        class {
          readonly controller: ReturnType<typeof linkPreviews>;
          constructor(view: EditorView) {
            this.controller = linkPreviews(
              view.dom,
              () => ({
                render: ctx.render,
                resources: ctx.resources,
                open(href, source, wiki = false) {
                  void ctx.rpc
                    .call(links, "open", {
                      href,
                      source,
                      wiki,
                      side: false,
                    })
                    .catch((error) =>
                      ctx.logger.warn("Preview navigation failed", error),
                    );
                },
              }),
              () => view.focus(),
            );
          }
          update(update: { docChanged: boolean }): void {
            if (update.docChanged) {
              this.controller.close();
            }
          }
          destroy(): void {
            this.controller.dispose();
          }
        },
      ),
    ),
  );
}
