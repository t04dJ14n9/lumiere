import assert from "node:assert/strict";
import test from "node:test";
import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  caretPreserveAnnotation,
  caretRestoreGeneration,
  withPreservedCaret,
} from "./preserve-caret";

function fixture() {
  let state = EditorState.create({
    doc: "one\ntwo\nthree",
    selection: EditorSelection.single(5),
    extensions: caretRestoreGeneration,
  });
  const scroll = Object.assign(new EventTarget(), {
    scrollTop: 12,
    scrollLeft: 3,
  });
  const view = {
    get state() {
      return state;
    },
    scrollDOM: scroll,
    dom: { isConnected: true },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  let finishLayout: (measured: boolean) => void = () => {};
  const layout = new Promise<boolean>((resolve) => {
    finishLayout = resolve;
  });
  return {
    view,
    scroll,
    preserve() {
      withPreservedCaret(
        view,
        () => {
          view.dispatch({ selection: EditorSelection.single(0) });
          scroll.scrollTop = 0;
          scroll.scrollLeft = 0;
        },
        () => layout,
      );
    },
    async finish(measured = true) {
      finishLayout(measured);
      await layout;
    },
  };
}

test("withPreservedCaret restores selection and scroll after a synchronous jump", async () => {
  const f = fixture();
  f.preserve();
  assert.equal(f.view.state.selection.main.head, 5);
  assert.equal(f.scroll.scrollTop, 12);
  assert.equal(f.scroll.scrollLeft, 3);
  await f.finish();
});

test("after-layout restore still repairs a tagged Live Preview remap", async () => {
  const f = fixture();
  f.preserve();
  f.view.dispatch({
    selection: EditorSelection.single(0),
    annotations: caretPreserveAnnotation.of("livePreviewRemap"),
  });
  await f.finish();
  assert.equal(f.view.state.selection.main.head, 5);
});

test("after-layout restore yields to an unannotated Vim-like motion", async () => {
  // codemirror-vim 6.4.0 setCursor dispatches {selection} with no userEvent.
  const f = fixture();
  f.preserve();
  f.view.dispatch({ selection: EditorSelection.single(9) });
  await f.finish();
  assert.equal(f.view.state.selection.main.head, 9);
});

for (const userEvent of [
  "select",
  "select.pointer",
  "input",
  "delete",
  "move.drop",
]) {
  test(`after-layout restore yields to a user selection (${userEvent})`, async () => {
    const f = fixture();
    f.preserve();
    f.view.dispatch({ selection: EditorSelection.single(9), userEvent });
    await f.finish();
    assert.equal(f.view.state.selection.main.head, 9);
  });
}

test("after-layout restore stays superseded after a user selection returns", async () => {
  const f = fixture();
  f.preserve();
  f.view.dispatch({
    selection: EditorSelection.single(9),
    userEvent: "select",
  });
  f.view.dispatch({
    selection: EditorSelection.single(5),
    userEvent: "select",
  });
  f.view.dispatch({ selection: EditorSelection.single(0) });
  await f.finish();
  assert.equal(f.view.state.selection.main.head, 0);
});

test("after-layout restore yields to a same-length document edit", async () => {
  const f = fixture();
  f.preserve();
  f.view.dispatch({
    changes: { from: 0, to: 3, insert: "ONE" },
    selection: EditorSelection.single(9),
  });
  await f.finish();
  assert.equal(f.view.state.sliceDoc(0, 3), "ONE");
  assert.equal(f.view.state.selection.main.head, 9);
});

for (const axis of ["scrollTop", "scrollLeft"] as const) {
  test(`after-layout restore yields to intervening ${axis}`, async () => {
    const f = fixture();
    f.preserve();
    f.scroll[axis] = 40;
    f.scroll.dispatchEvent(new Event("scroll"));
    f.view.dispatch({ selection: EditorSelection.single(0) });
    await f.finish();
    assert.equal(f.scroll[axis], 40);
    assert.equal(f.view.state.selection.main.head, 0);
  });
}

test("after-layout restore checks scroll even before its queued event fires", async () => {
  const f = fixture();
  f.preserve();
  f.scroll.scrollTop = 40;
  f.view.dispatch({ selection: EditorSelection.single(0) });
  await f.finish();
  assert.equal(f.scroll.scrollTop, 40);
  assert.equal(f.view.state.selection.main.head, 0);
});

test("after-layout restore stays superseded when scrolling returns to its start", async () => {
  const f = fixture();
  f.preserve();
  f.scroll.scrollTop = 40;
  f.scroll.dispatchEvent(new Event("scroll"));
  f.scroll.scrollTop = 12;
  f.scroll.dispatchEvent(new Event("scroll"));
  f.view.dispatch({ selection: EditorSelection.single(0) });
  await f.finish();
  assert.equal(f.view.state.selection.main.head, 0);
});

test("after-layout restore skips an unmeasured layout", async () => {
  const f = fixture();
  f.preserve();
  f.view.dispatch({ selection: EditorSelection.single(0) });
  await f.finish(false);
  assert.equal(f.view.state.selection.main.head, 0);
});

test("after-layout restore skips a destroyed view", async () => {
  const f = fixture();
  f.preserve();
  f.view.dispatch({ selection: EditorSelection.single(0) });
  Object.assign(f.view.dom, { isConnected: false });
  await f.finish();
  assert.equal(f.view.state.selection.main.head, 0);
});
