import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { mathBody } from "../../../src/plugins/math/source";
import { clickedSourceInsertHead } from "../../../src/plugins/vim/click-insert";
import { selectRenderedSource } from "../../../src/webview/ui/source-selection";
import { MarkdownInline } from "../../../src/webview/ui/inline-widget";
import type { RenderService } from "../../../src/plugins/render/api";
import {
  pointerSelection,
  setPointerSelection,
} from "../../../src/webview/ui/pointer-selection";

function selectionFixture(doc: string, hidden = false) {
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [pointerSelection],
  });
  const sourceNode = {} as Node;
  let native = EditorSelection.single(doc.length);
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
    domAtPos(offset: number) {
      return { node: sourceNode, offset };
    },
    posAtDOM(_node: Node, offset: number) {
      return hidden ? 0 : offset;
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
  };
}

for (const source of ["$x^2$", "$$\nx^2 + y\n\\frac{a}{b}\n$$"]) {
  test(`rendered ${source.startsWith("$$") ? "block" : "inline"} math click selects its body and typing keeps its delimiters`, () => {
    const prefix = "before\n\n";
    const suffix = "\n\nafter";
    const f = selectionFixture(prefix + source + suffix);
    const body = mathBody(source);
    const span = {
      from: prefix.length + body.from,
      to: prefix.length + body.to,
    };
    for (let click = 0; click < 2; click++) {
      selectRenderedSource(f.view, span);
      assert.ok(
        f.native.eq(f.view.state.selection),
        "native caret equals the insertion range even on a repeated click",
      );
      assert.equal(f.view.state.selection.main.head, span.from);
    }
    f.view.dispatch(f.view.state.replaceSelection("xyz"));
    assert.equal(
      f.view.state.doc.toString(),
      prefix +
        source.slice(0, body.from) +
        "xyz" +
        source.slice(body.to) +
        suffix,
    );
  });
}

test("hidden source keeps the document range until pointer thaw can draw it exactly", () => {
  const f = selectionFixture("before $x$ after", true);
  selectRenderedSource(f.view, { from: 8, to: 9 });
  assert.deepEqual(f.view.state.selection.main.toJSON(), {
    anchor: 9,
    head: 8,
  });
  assert.equal(f.native.main.head, f.view.state.doc.length);
});

test("a completed block click thaws pointer reveal before immediate typing", () => {
  const f = selectionFixture("before\n\n> [!note]\n> Body\n\nafter");
  f.view.dispatch({ effects: setPointerSelection(f.view.state.selection) });
  selectRenderedSource(f.view, { from: 8, to: 24 }, { settled: true });
  assert.equal(f.view.state.field(pointerSelection), null);
  for (const key of "xyz") {
    f.view.dispatch(f.view.state.replaceSelection(key));
  }
  assert.equal(f.view.state.doc.toString(), "before\n\nxyz\n\nafter");
});

test("inline math owns browser selection changes inside its rendered DOM", () => {
  const widget = new MarkdownInline("$x$", {} as RenderService, {
    select: mathBody,
  });
  assert.equal(widget.ignoreEvent(new Event("selectionchange")), true);
});

test("Vim i uses the clicked body head, while ordinary visual text objects keep their keys", () => {
  const clicked = EditorSelection.single(24, 21);
  const input = {
    clicked,
    selection: clicked,
    key: "i",
    modified: false,
    visual: true,
  };
  assert.equal(clickedSourceInsertHead(input), 21);
  assert.equal(clickedSourceInsertHead({ ...input, clicked: null }), undefined);
  assert.equal(
    clickedSourceInsertHead({ ...input, selection: EditorSelection.single(0) }),
    undefined,
  );
  assert.equal(clickedSourceInsertHead({ ...input, key: "c" }), undefined);
  assert.equal(
    clickedSourceInsertHead({ ...input, modified: true }),
    undefined,
  );
  assert.equal(clickedSourceInsertHead({ ...input, visual: false }), undefined);
});
