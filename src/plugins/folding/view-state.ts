import { foldEffect, foldedRanges, unfoldEffect } from "@codemirror/language";
import type { StateEffect } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Schema } from "../../kernel";

export const foldedSchema = Schema.array(
  new Schema<{ from: number; to: number }>(
    (value) => {
      const range = Schema.object({
        from: Schema.number(),
        to: Schema.number(),
      }).parse(value);
      if (
        !Number.isSafeInteger(range.from) ||
        !Number.isSafeInteger(range.to) ||
        range.from < 0 ||
        range.from >= range.to
      )
        throw new Error("Invalid fold range");
      return range;
    },
    { type: "object" },
  ),
);
export const foldedViewState = {
  schema: foldedSchema,
  capture(view: EditorView) {
    const ranges: { from: number; to: number }[] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });
    return ranges;
  },
  restore(view: EditorView, ranges: { from: number; to: number }[]) {
    const effects: StateEffect<unknown>[] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      effects.push(unfoldEffect.of({ from, to }));
    });
    for (const range of ranges) {
      if (range.to <= view.state.doc.length) effects.push(foldEffect.of(range));
    }
    view.dispatch({ effects });
  },
};
