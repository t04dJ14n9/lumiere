import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
export const spellcheckWebview: Plugin = {
  name: "spellcheck",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend(
        EditorView.contentAttributes.of({ spellcheck: "true" }),
      ),
    );
  },
};
