import { EditorView } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import { sourceVisibility } from "./paintable";
import { BlameController } from "./controller";
import { blameField, docVersionField, setBlame } from "./state";
import { protocol } from "./protocol";
import {
  blameIdentityField,
  blameOverlay,
  setBlameIdentity,
} from "./blameWidget";

export const gitBlameWebview: Plugin = {
  name: "gitBlame",
  inject: { required: ["editor", "rpc"], optional: ["livePreview"] },
  apply(ctx) {
    registerBlameController(ctx);
    registerIdentity(ctx);
  },
};

function registerBlameController(ctx: Context): void {
  // Captured while live: an update can reach the listener while the plugin
  // stops, before its own cleanups run, and a stopped context throws.
  const editor = ctx.editor;
  const rpc = ctx.rpc;
  const view = editor.view;
  const controller = new BlameController({
    read: () => {
      const head = view.state.selection.main.head;
      return {
        uri: editor.source,
        docVersion: view.state.field(docVersionField, false) ?? 0,
        caretLine: view.state.doc.lineAt(head).number,
        caretHead: head,
      };
    },
    contents: () => view.state.doc.toString(),
    request: (params) => rpc.call(protocol, "blameLine", params),
    paint: (blame) => {
      // Doc/caret invalidation has already cleared the field in its transaction.
      if (view.state.field(blameField, false) === blame) {
        return;
      }
      view.dispatch({ effects: setBlame.of(blame) });
    },
    after: (callback, ms) => {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  });
  const sourceVisibleAt = ctx.livePreview?.sourceVisibleAt;
  ctx.effect(() =>
    ctx.editor.extend([
      blameField,
      docVersionField,
      blameIdentityField,
      sourceVisibleAt ? sourceVisibility.of(sourceVisibleAt) : [],
      blameOverlay,
      EditorView.updateListener.of((update) => {
        const docChanged =
          update.docChanged ?? update.startState.doc !== update.state.doc;
        const selectionSet =
          update.selectionSet ??
          !update.startState.selection.eq(update.state.selection);
        if (docChanged || selectionSet) {
          controller.update();
        }
      }),
    ]),
  );
  ctx.effect(() => () => controller.dispose());
  ctx.effect(() =>
    ctx.rpc.on(protocol, "changed", ({ repoGeneration }) =>
      controller.repositoryChanged(repoGeneration),
    ),
  );
  void controller.refresh();
}

function registerIdentity(ctx: Context): void {
  const editor = ctx.editor;
  const rpc = ctx.rpc;
  let live = true;
  let serial = 0;
  const refresh = async (): Promise<void> => {
    const request = ++serial;
    const uri = editor.source;
    const identity = await rpc
      .call(protocol, "identity", {})
      .catch(() => undefined);
    if (!live || request !== serial || uri !== editor.source) {
      return;
    }
    editor.view.dispatch({ effects: setBlameIdentity.of(identity) });
  };
  ctx.effect(() => () => {
    live = false;
    serial++;
  });
  ctx.effect(() =>
    ctx.rpc.on(protocol, "changed", () => {
      void refresh();
    }),
  );
  void refresh();
}
