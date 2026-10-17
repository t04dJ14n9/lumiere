import { protocol as links } from "../links/protocol";
import { EditorView } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { footnoteInline } from "./inline";
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
    registerInlineReferences(ctx);
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

function registerInlineReferences(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.inline(
      footnoteInline(ctx.render, (jump) => ctx.editor.navigate(jump)),
    ),
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
  ctx.editor.navigate(() =>
    view.dispatch({
      selection: { anchor: at },
      effects: EditorView.scrollIntoView(at),
    }),
  );
  view.focus();
}
