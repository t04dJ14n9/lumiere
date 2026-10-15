import assert from "node:assert/strict";
import test from "node:test";
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import {
  pointerSelection,
  pointerSelectionTracking,
  revealFreezeToggled,
  revealRanges,
  setVisualRevealFreeze,
  visualRevealFreeze,
} from "../../webview/ui/pointer-selection";
import {
  freezeRevealDuringVisual,
  installVisualRevealFreeze,
} from "./visual-reveal";

function fixture(extensions: Extension = []) {
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: "before\n\n```\ncode\n```\n\nafter",
    extensions: [
      pointerSelectionTracking,
      compartment.of(freezeRevealDuringVisual()),
      extensions,
    ],
  });
  let updating = false;
  let destroyed = false;
  let tracking: ReturnType<typeof installVisualRevealFreeze> | undefined;
  const freezes: Transaction[] = [];
  const view = {
    get state() {
      return state;
    },
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      assert.equal(destroyed, false, "dispatch after view destruction");
      assert.equal(updating, false, "nested EditorView update");
      const transaction = state.update(...specs);
      state = transaction.state;
      const update: ViewUpdate = {
        view,
        state,
        startState: transaction.startState,
        transactions: [transaction],
        changes: transaction.changes,
        docChanged: transaction.docChanged,
        selectionSet: Boolean(transaction.selection),
        viewportChanged: false,
        viewportMoved: false,
        heightChanged: false,
        geometryChanged: transaction.docChanged,
        focusChanged: false,
      };
      if (transaction.effects.some((e) => e.is(setVisualRevealFreeze))) {
        freezes.push(transaction);
      }
      updating = true;
      try {
        if (transaction.reconfigured) {
          tracking?.destroy();
          tracking = undefined;
        }
        // Match the Vim ViewPlugin's update lifecycle, including mode events
        // from external selections, before updating our own view plugin.
        if (update.docChanged) {
          cm.onChange(update);
        }
        if (update.selectionSet) {
          cm.onSelectionChange();
        }
        if (cm.curOp && !cm.curOp.isVimOp) {
          cm.onBeforeEndOperation();
        }
        tracking?.update(update);
      } finally {
        updating = false;
      }
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  cm.scrollIntoView = () => {};
  cm.charCoords = (pos) => ({
    left: pos.ch * 10,
    top: pos.line * 20,
    bottom: pos.line * 20 + 20,
  });
  cm.findPosV = (pos, amount) => ({
    line: Math.max(0, Math.min(state.doc.lines - 1, pos.line + amount)),
    ch: pos.ch,
  });
  Vim.enterVimMode(cm);
  tracking = installVisualRevealFreeze(view, cm);
  return {
    view,
    cm,
    freezes,
    key(key: string) {
      cm.operation(() => {
        cm.curOp!.isVimOp = true;
        Vim.handleKey(cm, key, "user");
      });
    },
    remove() {
      view.dispatch({ effects: compartment.reconfigure([]) });
    },
    replace() {
      view.dispatch({
        effects: compartment.reconfigure(freezeRevealDuringVisual()),
      });
      tracking = installVisualRevealFreeze(view, cm);
    },
    destroy() {
      tracking?.destroy();
      tracking = undefined;
      Vim.leaveVimMode(cm);
      destroyed = true;
    },
  };
}

test("visual entry captures its selection before queued motions and freezes outside updates", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  const initial = f.view.state.selection;
  f.key("v");
  f.key("j");
  assert.equal(f.freezes.length, 0);
  assert.equal(f.view.state.field(visualRevealFreeze), null);
  await Promise.resolve();
  assert.ok(f.view.state.field(visualRevealFreeze)?.eq(initial));
  assert.notEqual(f.view.state.selection.main.head, initial.main.head);
  assert.equal(f.freezes.length, 1);
  assert.equal(
    revealFreezeToggled(f.freezes[0]!.startState, f.view.state),
    true,
  );

  f.key("j");
  f.key("V");
  await Promise.resolve();
  assert.ok(f.view.state.field(visualRevealFreeze)?.eq(initial));
  assert.equal(f.freezes.length, 1, "visual submode switches keep the freeze");

  f.key("<Esc>");
  assert.ok(f.view.state.field(visualRevealFreeze));
  await Promise.resolve();
  assert.equal(f.view.state.field(visualRevealFreeze), null);
  assert.equal(f.freezes.length, 2);
  assert.equal(
    revealFreezeToggled(f.freezes[1]!.startState, f.view.state),
    true,
  );
});

test("external selections enter and leave visual mode inside a view update without nested dispatch", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  const selected = EditorSelection.single(0, 6);
  f.view.dispatch({ selection: selected });
  assert.equal(f.cm.state.vim?.visualMode, true);
  assert.equal(f.freezes.length, 0);
  await Promise.resolve();
  assert.ok(f.view.state.field(visualRevealFreeze)?.eq(selected));

  f.view.dispatch({ selection: { anchor: 8 } });
  assert.equal(f.cm.state.vim?.visualMode, false);
  assert.equal(f.freezes.length, 1);
  await Promise.resolve();
  assert.equal(f.view.state.field(visualRevealFreeze), null);
  assert.equal(revealRanges(f.view.state)[0]!.head, 8);
});

for (const command of ["c", "I", "A"]) {
  test(`visual ${command} thaws on the insert event even while visualMode is still true`, async (t) => {
    const f = fixture();
    t.after(() => f.destroy());
    const insertEvents: boolean[] = [];
    f.cm.on("vim-mode-change", ({ mode }: { mode: string }) => {
      if (mode === "insert") {
        insertEvents.push(Boolean(f.cm.state.vim?.visualMode));
      }
    });
    f.key("v");
    await Promise.resolve();
    assert.ok(f.view.state.field(visualRevealFreeze));
    f.key("l");
    f.key(command);
    assert.deepEqual(insertEvents, [true]);
    assert.equal(f.cm.state.vim?.insertMode, true);
    assert.equal(f.cm.state.vim?.visualMode, false);
    await Promise.resolve();
    assert.equal(f.view.state.field(visualRevealFreeze), null);

    // Insertion must reveal the current caret, including after document edits.
    f.view.dispatch({ selection: { anchor: f.view.state.doc.length } });
    f.cm.replaceSelection(" more");
    assert.equal(
      revealRanges(f.view.state)[0]!.head,
      f.view.state.selection.main.head,
    );
  });
}

test("entering and leaving visual before the microtask does not apply a stale freeze", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.key("v");
  f.key("<Esc>");
  await Promise.resolve();
  assert.equal(f.view.state.field(visualRevealFreeze), null);
  assert.equal(f.freezes.length, 0);
});

test("leaving and reentering visual before the microtask uses the latest entry selection", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.key("v");
  f.key("<Esc>");
  f.key("l");
  const initial = f.view.state.selection;
  f.key("v");
  f.key("l");
  await Promise.resolve();
  assert.ok(f.view.state.field(visualRevealFreeze)?.eq(initial));
  assert.equal(f.freezes.length, 1);
});

test("a queued freeze maps its captured selection through subsequent document changes", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.view.dispatch({ selection: { anchor: 3 } });
  f.key("v");
  f.view.dispatch({ changes: { from: 0, insert: "prefix " } });
  await Promise.resolve();
  assert.equal(f.view.state.field(visualRevealFreeze)?.main.head, 10);
  f.view.dispatch({ changes: { from: 0, insert: "more " } });
  assert.equal(f.view.state.field(visualRevealFreeze)?.main.head, 15);
});

test("a visual event during a document update does not map the new selection twice", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  const selection = EditorSelection.single(7, 13);
  f.view.dispatch({ changes: { from: 0, insert: "prefix " }, selection });
  await Promise.resolve();
  assert.ok(f.view.state.field(visualRevealFreeze)?.eq(selection));
});

test("removing Vim while frozen thaws in the reconfiguration without a nested update", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.key("v");
  await Promise.resolve();
  f.key("j");
  const frozen = f.view.state;
  f.remove();
  assert.equal(f.view.state.field(visualRevealFreeze, false), undefined);
  assert.equal(revealFreezeToggled(frozen, f.view.state), true);
  assert.deepEqual(
    revealRanges(f.view.state),
    revealRanges(
      EditorState.create({
        doc: f.view.state.doc,
        selection: f.view.state.selection,
      }),
    ),
  );
  await Promise.resolve();
  assert.equal(f.freezes.length, 1, "cleanup needs no thaw transaction");
});

test("removing Vim cancels a pending freeze and detaches mode listeners", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.key("v");
  f.remove();
  await Promise.resolve();
  f.cm.signal("vim-mode-change", { mode: "normal" });
  f.cm.signal("vim-mode-change", { mode: "visual" });
  await Promise.resolve();
  assert.equal(f.freezes.length, 0);
  assert.equal(f.view.state.field(visualRevealFreeze, false), undefined);
});

test("replacing the tracker resynchronizes a retained freeze after a queued thaw", async (t) => {
  const f = fixture();
  t.after(() => f.destroy());
  f.key("v");
  await Promise.resolve();
  f.key("<Esc>");
  f.replace();
  assert.ok(f.view.state.field(visualRevealFreeze));
  await Promise.resolve();
  assert.equal(f.view.state.field(visualRevealFreeze), null);
  assert.equal(f.freezes.length, 2);
});

test("destroying the view cancels pending freeze and thaw transactions", async () => {
  for (const thaw of [false, true]) {
    const f = fixture();
    f.key("v");
    if (thaw) {
      await Promise.resolve();
      f.key("<Esc>");
    }
    const dispatched = f.freezes.length;
    f.destroy();
    await Promise.resolve();
    assert.equal(f.freezes.length, dispatched);
  }
});

test("pointer freeze keeps precedence and survives Vim removal", async (t) => {
  const pointer = EditorSelection.single(8);
  const f = fixture(pointerSelection.init(() => pointer));
  t.after(() => f.destroy());
  f.key("v");
  await Promise.resolve();
  f.key("j");
  assert.equal(revealRanges(f.view.state)[0]!.head, pointer.main.head);
  f.remove();
  assert.equal(f.view.state.field(pointerSelection), pointer);
  assert.equal(revealRanges(f.view.state)[0]!.head, pointer.main.head);
});
