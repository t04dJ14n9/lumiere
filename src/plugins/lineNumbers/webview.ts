import { lineNumbers } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
export const lineNumbersWebview: Plugin = {
  name: "lineNumbers",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() => ctx.editor.extend(lineNumbers()));
  },
};
