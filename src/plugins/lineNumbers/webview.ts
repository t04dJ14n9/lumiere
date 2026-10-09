import { lineNumbers } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import { headingGutterClasses } from "./headings";
import { widgetLineNumbers } from "./widgets";
export const lineNumbersWebview: Plugin = {
  name: "lineNumbers",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend([
        lineNumbers(),
        headingGutterClasses,
        widgetLineNumbers,
      ]),
    );
  },
};
