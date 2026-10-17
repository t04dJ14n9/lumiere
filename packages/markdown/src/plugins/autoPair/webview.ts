import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Context, Infer, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { config } from "./manifest";
export function pairs(options: Infer<typeof config>): string[] {
  return [
    ...(options.brackets ? ["(", "[", "{", "'", '"'] : []),
    ...(options.markdown ? ["*", "_", "`", "```"] : []),
  ];
}
const configurations = new WeakMap<Context, Compartment>();
const pairData = (options: Infer<typeof config>) =>
  EditorState.languageData.of(() => [
    { closeBrackets: { brackets: pairs(options) } },
  ]);
export const autoPairWebview: Plugin<Infer<typeof config>> = {
  name: "autoPair",
  config,
  inject: { required: ["editor"] },
  reconfigure(ctx, options) {
    const compartment = configurations.get(ctx);
    if (!compartment) {
      return false;
    }
    ctx.editor.view.dispatch({
      effects: compartment.reconfigure(pairData(options)),
    });
    return true;
  },
  apply(ctx, options) {
    const compartment = new Compartment();
    configurations.set(ctx, compartment);
    ctx.effect(() => () => {
      configurations.delete(ctx);
    });
    ctx.effect(() =>
      ctx.editor.extend([
        closeBrackets(),
        keymap.of(closeBracketsKeymap),
        compartment.of(pairData(options)),
      ]),
    );
  },
};
