import type {} from "./api";
import {
  foldService,
  codeFolding,
  foldGutter,
  foldAll,
  unfoldAll,
  toggleFold,
  indentUnit,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { Infer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import { headings } from "../../markdown/metadata/headings";
import { config } from "./manifest";

export function foldRange(
  state: EditorState,
  start: number,
  end: number,
  options: Infer<typeof config>,
) {
  if (options.heading) {
    const heading = headings(state.doc.toString()).find(
      (item) => item.from >= start && item.from <= end,
    );
    if (heading && heading.end > heading.to)
      return { from: heading.to, to: heading.end };
  }
  if (!options.indent) return null;
  const line = state.doc.lineAt(start);
  const width = (text: string) => {
    let count = 0;
    for (const char of text) {
      if (char === " ") count++;
      else if (char === "\t") count += state.tabSize - (count % state.tabSize);
      else break;
    }
    return count;
  };
  const base = width(line.text);
  let to = end;
  for (let number = line.number + 1; number <= state.doc.lines; number++) {
    const next = state.doc.line(number);
    if (!next.text.trim()) continue;
    if (width(next.text) <= base) break;
    to = next.to;
  }
  return to > end ? { from: end, to } : null;
}
export const foldingWebview: Plugin<Infer<typeof config>> = {
  name: "folding",
  config,
  inject: { required: ["editor", "commands"] },
  apply(ctx, options) {
    ctx.provide("fold", {
      foldAll: () => foldAll(ctx.editor.view),
      unfoldAll: () => unfoldAll(ctx.editor.view),
      toggle: () => toggleFold(ctx.editor.view),
    });
    ctx.effect(() =>
      ctx.editor.extend([
        codeFolding(),
        foldGutter(),
        indentUnit.of("\t"),
        foldService.of((state, start, end) =>
          foldRange(state, start, end, options),
        ),
      ]),
    );
    ctx.effect(() => () => {
      unfoldAll(ctx.editor.view);
    });
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
