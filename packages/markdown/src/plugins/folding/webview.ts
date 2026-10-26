import type {} from "./api";
import {
  foldService,
  codeFolding,
  foldGutter,
  unfoldAll,
  foldState,
} from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { Compartment, type EditorState, type Text } from "@codemirror/state";
import { foldedViewState } from "./view-state";
import type { Context, Infer, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import { documentTree } from "../livePreview/api";
import { headingFold } from "./heading-fold";
import { config } from "./manifest";
import {
  applyFolds,
  foldAllEffects,
  foldLessEffect,
  foldMoreEffect,
  toggleLineFolds,
} from "./commands";

const foldAll = (view: EditorView) =>
  applyFolds(view, foldAllEffects(view.state));
const toggleFold = (view: EditorView) =>
  applyFolds(view, toggleLineFolds(view.state));
const foldMore = (view: EditorView) =>
  applyFolds(view, foldMoreEffect(view.state));
const foldLess = (view: EditorView) =>
  applyFolds(view, foldLessEffect(view.state));

interface CachedFoldRange {
  end: number;
  range: { from: number; to: number } | null;
}
const foldRanges = new WeakMap<
  Text,
  Map<string, Map<number, CachedFoldRange>>
>();

function indentWidth(text: string, tabSize: number): number {
  let count = 0;
  for (const char of text) {
    if (char === " ") {
      count++;
    } else if (char === "\t") {
      count += tabSize - (count % tabSize);
    } else {
      break;
    }
  }
  return count;
}

function indentFold(
  doc: Text,
  start: number,
  end: number,
  tabSize: number,
): { from: number; to: number } | null {
  const line = doc.lineAt(start);
  if (!line.text.trim()) {
    return null;
  }
  const base = indentWidth(line.text, tabSize);
  let to = end;
  for (let number = line.number + 1; number <= doc.lines; number++) {
    const next = doc.line(number);
    if (!next.text.trim()) {
      continue;
    }
    if (indentWidth(next.text, tabSize) <= base) {
      break;
    }
    to = next.to;
  }
  return to > end ? { from: end, to } : null;
}

export function foldRange(
  state: EditorState,
  start: number,
  end: number,
  options: Infer<typeof config>,
) {
  let byKey = foldRanges.get(state.doc);
  if (!byKey) {
    byKey = new Map();
    foldRanges.set(state.doc, byKey);
  }
  const key = `${options.heading ? 1 : 0}:${options.indent ? 1 : 0}:${state.tabSize}`;
  let cache = byKey.get(key);
  if (!cache) {
    cache = new Map();
    byKey.set(key, cache);
  }
  const cached = cache.get(start);
  if (cached?.end === end) {
    return cached.range;
  }
  let range: { from: number; to: number } | null = null;
  if (options.heading) {
    range = headingFold(
      state.doc,
      start,
      end,
      state.field(documentTree, false),
    );
  }
  if (!range && options.indent) {
    range = indentFold(state.doc, start, end, state.tabSize);
  }
  cache.set(start, { end, range });
  return range;
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
  provides: ["fold"],
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
      ["fold-more", foldMore],
      ["fold-less", foldLess],
    ] as const) {
      ctx.effect(() =>
        ctx.commands.register(`editor:${id}`, () => command(ctx.editor.view)),
      );
    }
  },
};
