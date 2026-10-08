import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Infer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import { config } from "./manifest";
export function pairs(options: Infer<typeof config>): string[] {
  return [
    ...(options.brackets ? ["(", "[", "{", "'", '"'] : []),
    ...(options.markdown ? ["*", "_", "`", "```"] : []),
  ];
}
export const autoPairWebview: Plugin<Infer<typeof config>> = {
  name: "autoPair",
  config,
  inject: { required: ["editor"] },
  apply(ctx, options) {
    ctx.effect(() =>
      ctx.editor.extend([
        closeBrackets(),
        keymap.of(closeBracketsKeymap),
        EditorState.languageData.of(() => [
          { closeBrackets: { brackets: pairs(options) } },
        ]),
      ]),
    );
  },
};
