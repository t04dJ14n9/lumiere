import { EditorView } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import { BlameController } from "./controller";
import { blameField, docVersionField, setBlame } from "./state";
import { protocol } from "./protocol";

export const gitBlameWebview: Plugin = {
  name: "gitBlame",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    registerBlameController(ctx);
  },
};

function registerBlameController(ctx: Context): void {
  const view = ctx.editor.view;
  const controller = new BlameController({
    read: () => ({
      uri: ctx.editor.source,
      docVersion: view.state.field(docVersionField, false) ?? 0,
      caretLine: view.state.doc.lineAt(view.state.selection.main.head).number,
    }),
    contents: () => view.state.doc.toString(),
    request: (params) => ctx.rpc.call(protocol, "blameLine", params),
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
  ctx.effect(() =>
    ctx.editor.extend([
      blameField,
      docVersionField,
      EditorView.updateListener.of(() => controller.update()),
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
