import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import {
  isPointerSelecting,
  pointerSelection,
  setPointerSelection,
} from "../../webview/ui/pointer-selection";
import { documentTree } from "./document-tree";
import { HybridInline } from "./inline";

const doc =
  "before\n\n# Heading\n\n**bold** [label](Target.md)\n\n```\ncode\n```\n\nafter";
const nextViewport = { from: doc.indexOf("# Heading"), to: doc.length - 7 };

function fixture() {
  const view = {
    state: EditorState.create({
      doc,
      extensions: [documentTree, pointerSelection],
    }),
    visibleRanges: [{ from: 0, to: 6 }],
    composing: false,
  };
  const editorView = view as unknown as EditorView;
  const inline = new HybridInline(editorView);
  return {
    view,
    inline,
    update(spec: TransactionSpec = {}, viewportChanged = false) {
      const transaction = view.state.update(spec);
      view.state = transaction.state;
      const update: ViewUpdate = {
        view: editorView,
        state: transaction.state,
        startState: transaction.startState,
        transactions: [transaction],
        changes: transaction.changes,
        docChanged: transaction.docChanged,
        selectionSet: Boolean(transaction.selection),
        viewportChanged,
        viewportMoved: viewportChanged,
        heightChanged: false,
        geometryChanged: transaction.docChanged,
        focusChanged: false,
      };
      inline.update(update);
      return update;
    },
  };
}

function presentation(decorations: DecorationSet) {
  const classes: string[] = [];
  const hidden: string[] = [];
  decorations.between(0, doc.length, (from, to, decoration) => {
    if (decoration.spec.class) {
      classes.push(decoration.spec.class);
    } else if (from < to) {
      hidden.push(doc.slice(from, to));
    }
  });
  return { classes, hidden };
}

function assertRendered(decorations: DecorationSet) {
  const { classes, hidden } = presentation(decorations);
  assert.ok(classes.includes("md-heading md-h1"), "new heading is rendered");
  assert.ok(classes.includes("md-strong"), "new emphasis is rendered");
  assert.ok(
    classes.includes("md-link md-link-rendered"),
    "new link is rendered",
  );
  assert.deepEqual(hidden, [
    "# ",
    "**",
    "**",
    "[",
    "](Target.md)",
    "```",
    "```",
  ]);
}

test("holding a scrollbar press renders newly visible Markdown without moving the selection", () => {
  const f = fixture();
  const selection = f.view.state.selection;
  f.update({ effects: setPointerSelection(selection) });
  assert.equal(f.inline.decorations.size, 0);

  f.view.visibleRanges = [nextViewport];
  const update = f.update({}, true);
  assert.equal(isPointerSelecting(update.state), true);
  assert.equal(update.selectionSet, false);
  assert.ok(update.state.selection.eq(selection));
  assert.equal(update.state.doc.toString(), doc);
  assertRendered(f.inline.decorations);

  // Paging back and forth while holding the track/thumb keeps rendering.
  f.view.visibleRanges = [{ from: 0, to: 6 }];
  f.update({}, true);
  assert.equal(f.inline.decorations.size, 0);
  f.view.visibleRanges = [nextViewport];
  f.update({}, true);
  assertRendered(f.inline.decorations);
});

test("selection autoscroll renders the next viewport using the frozen reveal ranges until release", () => {
  const f = fixture();
  f.update({ effects: setPointerSelection(f.view.state.selection) });
  f.view.visibleRanges = [nextViewport];
  f.update({ selection: { anchor: 0, head: doc.length } }, true);
  assertRendered(f.inline.decorations);

  f.update({ effects: setPointerSelection(null) });
  assert.equal(isPointerSelecting(f.view.state), false);
  const { classes, hidden } = presentation(f.inline.decorations);
  assert.ok(classes.includes("md-syntax-mark"));
  assert.ok(classes.includes("md-link"));
  assert.deepEqual(hidden, []);
});

test("selection growth alone keeps the existing drag decorations", (t) => {
  const f = fixture();
  f.view.visibleRanges = [nextViewport];
  f.update({}, true);
  f.update({ effects: setPointerSelection(f.view.state.selection) });
  const decorations = f.inline.decorations;
  const iterate = t.mock.method(f.view.state.field(documentTree), "iterate");
  f.update({ selection: { anchor: 0, head: doc.length } });
  assert.equal(iterate.mock.callCount(), 0);
  assert.equal(f.inline.decorations, decorations);
  assertRendered(f.inline.decorations);
});

test("wheel and keyboard viewport changes render without a pointer freeze", () => {
  const f = fixture();
  f.view.visibleRanges = [nextViewport];
  f.update({}, true);
  assert.equal(isPointerSelecting(f.view.state), false);
  assertRendered(f.inline.decorations);
});

test("composition still maps existing decorations when the viewport changes", () => {
  const f = fixture();
  f.view.visibleRanges = [nextViewport];
  f.update({}, true);
  const original = f.inline.decorations.iter();
  f.view.composing = true;
  f.view.visibleRanges = [{ from: 0, to: 6 }];
  f.update({ changes: { from: 0, insert: "prefix " } }, true);
  const mapped = f.inline.decorations.iter();
  assert.equal(mapped.from, original.from + 7);
  assert.equal(mapped.value, original.value);
});
