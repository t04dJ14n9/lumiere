import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Context, Infer, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { config } from "./manifest";
import { stickyMaxLines, stickyScrollExtension } from "./view";

const configurations = new WeakMap<Context, Compartment>();

export const stickyScrollWebview: Plugin<Infer<typeof config>> = {
  name: "stickyScroll",
  config,
  inject: { required: ["editor"] },
  reconfigure(ctx, options) {
    const compartment = configurations.get(ctx);
    if (!compartment) {
      return false;
    }
    ctx.editor.view.dispatch({
      effects: compartment.reconfigure(stickyMaxLines.of(options.maxLines)),
    });
    return true;
  },
  apply(ctx, options) {
    registerStickyHeadings(ctx, options.maxLines);
  },
};

function registerStickyHeadings(ctx: Context, maxLines: number): void {
  const compartment = new Compartment();
  configurations.set(ctx, compartment);
  ctx.effect(() => () => {
    configurations.delete(ctx);
  });
  ctx.effect(() =>
    ctx.editor.extend([
      compartment.of(stickyMaxLines.of(maxLines)),
      stickyScrollExtension((position) =>
        ctx.editor.navigate(() => {
          ctx.editor.focus();
          const sticky = ctx.editor.view.dom.querySelector(".mw-sticky-scroll");
          const stickyHeight =
            sticky instanceof HTMLElement && !sticky.hidden
              ? sticky.getBoundingClientRect().height
              : 0;
          ctx.editor.view.dispatch({
            selection: { anchor: position },
            effects: EditorView.scrollIntoView(position, {
              y: "start",
              yMargin: stickyHeight,
            }),
            userEvent: "select",
          });
        }),
      ),
    ]),
  );
}
