import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type StateEffect } from "@codemirror/state";
import { foldService, foldState, foldedRanges } from "@codemirror/language";
import { foldRange } from "../../../src/plugins/folding/webview";
import {
  foldAllEffects,
  foldLessEffect,
  foldMoreEffect,
  toggleLineFolds,
} from "../../../src/plugins/folding/commands";

// Expected lines are Obsidian's, measured in a throwaway vault (2026-10-17).
const HEADINGS = "# A\na1\n## B\nb1\n### B1\nb11\n## C\nc1\n# D\nd1";
const LIST = "- a\n  - b\n    - c\n  - b2\n- d\n  - e";

type Command = (
  state: EditorState,
) => StateEffect<unknown>[] | StateEffect<unknown> | undefined;
const COMMANDS: Record<string, Command> = {
  all: foldAllEffects,
  more: foldMoreEffect,
  less: foldLessEffect,
  toggle: toggleLineFolds,
};

/** The line numbers still shown after running `commands` with the caret on `line`. */
function visible(doc: string, line: number, commands: string[]): string {
  let state = EditorState.create({
    doc,
    extensions: [
      foldState,
      foldService.of((state, from, to) =>
        foldRange(state, from, to, { heading: true, indent: true }),
      ),
    ],
  });
  state = state.update({
    selection: { anchor: state.doc.line(line).from },
  }).state;
  for (const name of commands) {
    const effects = COMMANDS[name]!(state);
    state = state.update({
      effects: effects === undefined ? [] : [effects].flat(),
    }).state;
  }
  const hidden = new Set<number>();
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    for (let n = state.doc.lineAt(from).number + 1; n <= state.doc.lines; n++) {
      if (state.doc.line(n).to <= to) {
        hidden.add(n);
      }
    }
  });
  return Array.from({ length: state.doc.lines }, (_, i) => i + 1)
    .filter((n) => !hidden.has(n))
    .join(",");
}

test("Toggle Fold folds or unfolds only the section that starts on the caret's line", () => {
  assert.equal(visible(HEADINGS, 3, ["toggle"]), "1,2,3,7,8,9,10");
  assert.equal(
    visible(HEADINGS, 3, ["toggle", "toggle"]),
    "1,2,3,4,5,6,7,8,9,10",
  );
  // Body text and a list item without children start no section: nothing folds.
  assert.equal(visible(HEADINGS, 2, ["toggle"]), "1,2,3,4,5,6,7,8,9,10");
  assert.equal(visible(LIST, 3, ["toggle"]), "1,2,3,4,5,6");
  assert.equal(visible(LIST, 4, ["toggle"]), "1,2,3,4,5,6");
  assert.equal(visible(LIST, 2, ["toggle"]), "1,2,4,5,6");
});

test("Fold more folds the innermost open section around the caret, then the next one out", () => {
  assert.equal(visible(HEADINGS, 5, ["more"]), "1,2,3,4,5,7,8,9,10");
  assert.equal(visible(HEADINGS, 5, ["more", "more"]), "1,2,3,7,8,9,10");
  assert.equal(visible(HEADINGS, 5, ["more", "more", "more"]), "1,9,10");
  assert.equal(visible(HEADINGS, 2, ["more"]), "1,9,10");
  assert.equal(visible(HEADINGS, 1, ["more", "more"]), "1,9,10");
  assert.equal(visible(LIST, 3, ["more"]), "1,2,4,5,6");
  assert.equal(visible(LIST, 3, ["more", "more"]), "1,5,6");
});

test("Fold All folds nested sections too, so Fold less opens one level at a time", () => {
  assert.equal(visible(HEADINGS, 1, ["all"]), "1,9");
  assert.equal(visible(HEADINGS, 1, ["all", "less"]), "1,2,3,7,9");
  assert.equal(visible(HEADINGS, 5, ["all", "less", "less"]), "1,2,3,4,5,7,9");
  assert.equal(visible(HEADINGS, 1, ["all", "less", "less"]), "1,2,3,7,9");
  assert.equal(visible(LIST, 1, ["all", "less"]), "1,2,4,5");
  assert.equal(visible(LIST, 5, ["all", "less"]), "1,5,6");
});
