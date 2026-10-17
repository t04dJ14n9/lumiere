import type {} from "./api";
import {
  foldService,
  codeFolding,
  foldGutter,
  foldAll,
  unfoldAll,
  toggleFold,
  foldState,
} from "@codemirror/language";
import { Compartment } from "@codemirror/state";
import { foldedViewState } from "./view-state";
import type { Context, Infer, Plugin } from "@workshop/core";
import type { EditorState } from "@codemirror/state";
import type {} from "../editor/api";
import type {} from "../commands/api";
import { headingFold } from "./heading-fold";
import { config } from "./manifest";

export function foldRange(
  state: EditorState,
  start: number,
  end: number,
  options: Infer<typeof config>,
) {
  if (options.heading) {
    const range = headingFold(state.doc, start, end);
    if (range) {
      return range;
    }
  }
  if (!options.indent) {
    return null;
  }
  const line = state.doc.lineAt(start);
  const width = (text: string) => {
    let count = 0;
    for (const char of text) {
      if (char === " ") {
        count++;
      } else if (char === "\t") {
        count += state.tabSize - (count % state.tabSize);
      } else {
        break;
      }
    }
    return count;
  };
  const base = width(line.text);
  let to = end;
  for (let number = line.number + 1; number <= state.doc.lines; number++) {
    const next = state.doc.line(number);
    if (!next.text.trim()) {
      continue;
    }
    if (width(next.text) <= base) {
      break;
    }
    to = next.to;
  }
  return to > end ? { from: end, to } : null;
}
/** CodeMirror's gutter otherwise ignores fold-service and tab-width changes. */
export function foldingChanged(update: {
  startState: EditorState;
  state: EditorState;
}): boolean {
  return (
    update.startState.facet(foldService) !== update.state.facet(foldService) ||
    update.startState.tabSize !== update.state.tabSize
  );
}
const configurations = new WeakMap<Context, Compartment>();
const foldingConfig = (options: Infer<typeof config>) =>
  foldService.of((state, start, end) => foldRange(state, start, end, options));
export const foldingWebview: Plugin<Infer<typeof config>> = {
  name: "folding",
  config,
  inject: { required: ["editor", "commands"] },
  reconfigure(ctx, options) {
    const compartment = configurations.get(ctx);
    if (!compartment) {
      return false;
    }
    ctx.editor.view.dispatch({
      effects: compartment.reconfigure(foldingConfig(options)),
    });
    return true;
  },
  apply(ctx, options) {
    const compartment = new Compartment();
    configurations.set(ctx, compartment);
    ctx.effect(() => () => {
      configurations.delete(ctx);
    });
    ctx.provide("fold", {
      foldAll: () => foldAll(ctx.editor.view),
      unfoldAll: () => unfoldAll(ctx.editor.view),
      toggle: () => toggleFold(ctx.editor.view),
    });
    ctx.effect(() =>
      ctx.editor.extend([
        codeFolding(),
        foldGutter({ foldingChanged }),
        foldState,
        compartment.of(foldingConfig(options)),
      ]),
    );
    ctx.effect(() =>
      ctx.editor.viewState.contribute("folded", foldedViewState),
    );
    for (const [id, command] of [
      ["fold-all", foldAll],
      ["unfold-all", unfoldAll],
      ["toggle-fold", toggleFold],
    ] as const) {
      ctx.effect(() =>
        ctx.commands.register(`editor:${id}`, () => command(ctx.editor.view)),
      );
    }
  },
};
