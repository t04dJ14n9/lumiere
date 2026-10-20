import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  pointerSelection,
  setPointerSelection,
} from "../../webview/ui/pointer-selection";
import { selectFootnoteDefinition } from "./select-definition";

function selectionFixture(doc: string) {
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [pointerSelection],
  });
  const sourceNode = {} as Node;
  let native = EditorSelection.single(doc.length);
  let focused = false;
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {
      focused = true;
    },
    domAtPos(offset: number) {
      return { node: sourceNode, offset };
    },
    posAtDOM(_node: Node, offset: number) {
      return offset;
    },
    dom: {
      ownerDocument: {
        getSelection: () => ({
          setBaseAndExtent(
            anchorNode: Node,
            anchor: number,
            headNode: Node,
            head: number,
          ) {
            assert.equal(anchorNode, sourceNode);
            assert.equal(headNode, sourceNode);
            native = EditorSelection.single(anchor, head);
          },
        }),
      },
    },
  } as unknown as EditorView;
  return {
    view,
    get native() {
      return native;
    },
    get focused() {
      return focused;
    },
  };
}

test("footnote definition handoff clears pointer freeze and owns the caret", () => {
  const doc = "See the note.[^1]\n\nafter\n\n[^1]: Footnote body.";
  const at = doc.indexOf("[^1]:");
  const f = selectionFixture(doc);
  f.view.dispatch({ effects: setPointerSelection(f.view.state.selection) });
  assert.notEqual(f.view.state.field(pointerSelection), null);

  selectFootnoteDefinition(f.view, at);

  assert.equal(f.view.state.field(pointerSelection), null);
  assert.equal(f.view.state.selection.main.from, at);
  assert.equal(f.view.state.selection.main.to, at);
  assert.equal(f.native.main.head, at);
  assert.equal(f.focused, true);
  f.view.dispatch(f.view.state.replaceSelection("xyz"));
  assert.equal(
    f.view.state.doc.toString(),
    "See the note.[^1]\n\nafter\n\nxyz[^1]: Footnote body.",
  );
});

test("footnote definition handoff clamps past the document end", () => {
  const f = selectionFixture("short");
  selectFootnoteDefinition(f.view, 99);
  assert.equal(f.view.state.selection.main.from, 5);
  assert.equal(f.native.main.head, 5);
});
