import { keymap } from "@codemirror/view";
import { markdownKeymap } from "@codemirror/lang-markdown";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
export const smartListsWebview: Plugin = {
  name: "smartLists",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() => ctx.editor.extend(keymap.of(markdownKeymap)));
  },
};
