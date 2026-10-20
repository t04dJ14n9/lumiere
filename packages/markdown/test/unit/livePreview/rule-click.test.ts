import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { ruleSelection } from "../../../src/plugins/livePreview/rule-click";
import { selectRenderedSource } from "../../../src/webview/ui/source-selection";
import {
  CLICK_SELECT,
  pointerSelection,
  setPointerSelection,
} from "../../../src/webview/ui/pointer-selection";

test("as in Obsidian, a click on a rule selects its source with the head at its start", () => {
  // "above\n\n---": Obsidian selects from 7 to 10 (head at start).
  assert.deepEqual(ruleSelection("---", 7), { from: 7, to: 10 });
  assert.deepEqual(ruleSelection("* * *", 0), { from: 0, to: 5 });
  // Indentation and trailing spaces are not the rule.
  assert.deepEqual(ruleSelection("  ___  ", 20), { from: 22, to: 25 });
});

test("rule click handoff clears pointer freeze and tags select.click so typing owns the rule", () => {
  const doc = "above\n\n---\n\nafter";
  const span = ruleSelection("---", doc.indexOf("---"));
  let state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [pointerSelection],
  });
  state = state.update({
    effects: setPointerSelection(EditorSelection.single(0)),
  }).state;
  assert.ok(state.field(pointerSelection));

  let userEvent: string | undefined;
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      userEvent =
        typeof spec === "object" && spec && "userEvent" in spec
          ? (spec as { userEvent?: string }).userEvent
          : undefined;
      state = state.update(spec).state;
    },
    focus() {},
    domAtPos(offset: number) {
      return { node: {} as Node, offset };
    },
    // Drawn rule hides source until reveal; skip native DOM sync.
    posAtDOM() {
      return -1;
    },
    dom: {
      ownerDocument: {
        getSelection: () => null,
      },
    },
  } as unknown as EditorView;

  selectRenderedSource(view, span, { settled: true });

  assert.equal(userEvent, CLICK_SELECT);
  assert.equal(state.field(pointerSelection), null, "settled clears freeze");
  assert.equal(state.selection.main.head, span.from);
  assert.equal(state.selection.main.anchor, span.to);
});
