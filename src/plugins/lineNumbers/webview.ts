import { Compartment } from "@codemirror/state";
import type { Context, Infer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import { headingGutterClasses } from "./headings";
import { lineNumberGutter } from "./gutter";
import { config } from "./manifest";
const compartments = new WeakMap<Context, Compartment>();
export const lineNumbersWebview: Plugin<Infer<typeof config>> = {
  name: "lineNumbers",
  config,
  inject: { required: ["editor"] },
  reconfigure(ctx, options) {
    const compartment = compartments.get(ctx);
    if (!compartment) {
      return false;
    }
    ctx.editor.view.dispatch({
      effects: compartment.reconfigure(lineNumberGutter(options.style)),
    });
    return true;
  },
  apply(ctx, options) {
    const compartment = new Compartment();
    compartments.set(ctx, compartment);
    ctx.effect(() => () => {
      compartments.delete(ctx);
    });
    ctx.effect(() =>
      ctx.editor.extend([
        compartment.of(lineNumberGutter(options.style)),
        headingGutterClasses,
      ]),
    );
  },
};
