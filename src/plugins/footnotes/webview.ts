import { protocol as links } from "../links/protocol";
import { EditorView } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { FootnoteDefinition } from "./definition-widget";
import { FootnoteReference } from "./reference-widget";
import { insertFootnote } from "./edit";
import { RenderedReferences } from "./render-references";
export const footnotesWebview: Plugin = {
  name: "footnotes",
  inject: { required: ["editor", "commands", "livePreview", "render", "rpc"] },
  apply(ctx) {
    registerDefinitionInvalidation(ctx);
    const view = ctx.editor.view;
    const references = new RenderedReferences(
      () => view.state.doc,
      ctx.render,
      (note, pass) => navigateReference(ctx, note, pass),
    );
    ctx.effect(() => () => references.dispose());
    registerReferenceTheme(ctx);
    registerInlineReferences(ctx);
    registerDefinitions(ctx);
    ctx.on("render/preProcess", (pass) => references.prepare(pass));
    ctx.on("render/postProcess", (pass) => references.mount(pass));
    registerInsertFootnote(ctx);
  },
};

function registerDefinitionInvalidation(ctx: Context): void {
  let active = true;
  let key = "";
  ctx.effect(() => () => {
    active = false;
  });
  ctx.effect(() =>
    ctx.editor.extend(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) {
          return;
        }
        const next = JSON.stringify(footnotes(update.state.doc).definitions);
        if (next === key) {
          return;
        }
        key = next;
        queueMicrotask(() => {
          if (active) {
            ctx.emit("render/changed");
          }
        });
      }),
    ),
  );
}

function registerReferenceTheme(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      EditorView.baseTheme({
        ".hybrid-footnote-ref": { position: "relative" },
        ".footnote-preview": {
          position: "absolute",
          left: "0",
          top: "100%",
          zIndex: "100",
          width: "min(320px, 70vw)",
          padding: "12px",
          background: "var(--vscode-editorHoverWidget-background)",
          border: "1px solid var(--vscode-editorHoverWidget-border)",
          fontSize: "14px",
        },
      }),
    ),
  );
}

function registerInlineReferences(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["FootnoteRef", "InlineFootnote"],
      decorate(node, cx) {
        const note = footnotes(cx.state.doc).references.get(node.from);
        if (note && !cx.revealed(node.from, node.to)) {
          cx.replace(
            node.from,
            node.to,
            new FootnoteReference(note, ctx.render),
          );
        }
      },
    }),
  );
}

function registerDefinitions(ctx: Context): void {
  const view = ctx.editor.view;
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "footnote",
      editing: "reveal",
      match: (node, state) =>
        node.name !== "Document" &&
        footnotes(state.doc).definitions.some(
          (note) => note.label && note.marker === node.from,
        ),
      range: (node, state) =>
        footnotes(state.doc).definitions.find(
          (note) => note.marker === node.from,
        ) ?? node,
      widget(block) {
        const note = footnotes(view.state.doc).definitions.find(
          (note) => note.from === block.from,
        );
        if (!note) {
          throw new Error("Footnote definition changed while rendering");
        }
        return new FootnoteDefinition(block, note, ctx.render);
      },
    }),
  );
}

function registerInsertFootnote(ctx: Context): void {
  const view = ctx.editor.view;
  ctx.effect(() =>
    ctx.commands.register("editor:insert-footnote", () => {
      view.dispatch(insertFootnote(view.state));
      return true;
    }),
  );
}

function navigateReference(
  ctx: Context,
  note: Footnote,
  pass: RenderPass,
): void {
  const view = ctx.editor.view;
  if (pass.documentUri) {
    void ctx.rpc
      .call(links, "open", {
        href: "",
        source: pass.documentUri,
        at: note.from,
        wiki: false,
        side: false,
      })
      .catch((error) => ctx.logger.warn("Footnote navigation failed", error));
    return;
  }
  const at = Math.min(view.state.doc.length, note.from);
  view.dispatch({
    selection: { anchor: at },
    effects: EditorView.scrollIntoView(at),
  });
  view.focus();
}
