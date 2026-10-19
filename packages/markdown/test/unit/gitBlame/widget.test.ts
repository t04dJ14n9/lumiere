import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import {
  BlameGhostMarker,
  blameGhostField,
  blameIdentityField,
  placeGhost,
  setBlameIdentity,
} from "../../../src/plugins/gitBlame/blameWidget";
import {
  BlameTooltip,
  isInside,
} from "../../../src/plugins/gitBlame/blameTooltip";
import { blameField, setBlame } from "../../../src/plugins/gitBlame/state";
import type { GitBlameOk } from "../../../src/shared/git-blame";

const blame: GitBlameOk = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hi",
  body: "- detail one\n- detail two",
  line: 2,
};
function state() {
  return EditorState.create({
    doc: "first\nsecond\nthird",
    selection: { anchor: 7 },
    extensions: [blameField, blameIdentityField, blameGhostField],
  });
}

test("the ghost follows the end of the main caret line, with its message and the reader's name", () => {
  let editor = state();
  assert.equal(editor.field(blameGhostField), null);
  editor = editor.update({ effects: setBlame.of(blame) }).state;
  const ghost = editor.field(blameGhostField);
  assert.equal(ghost?.anchor, editor.doc.line(2).to);
  assert.match(ghost?.text ?? "", /^Hi, Ada \(/);
  assert.match(ghost?.tooltip ?? "", /Ada\n/);
  assert.match(ghost?.tooltip ?? "", /detail one/);
  editor = editor.update({
    effects: setBlameIdentity.of({ userEmail: "ADA@example.com" }),
  }).state;
  assert.match(editor.field(blameGhostField)?.text ?? "", /^Hi, You \(/);
});

test("an unchanged ghost keeps its object, so the layer does not redraw", () => {
  const editor = state().update({ effects: setBlame.of(blame) }).state;
  const moved = editor.update({ selection: { anchor: 8 } }).state;
  assert.equal(moved.field(blameGhostField), editor.field(blameGhostField));
});

test("an empty result, an edit and a caret-line move clear the ghost at once", () => {
  let editor = state().update({ effects: setBlame.of(blame) }).state;
  editor = editor.update({ selection: { anchor: 8 } }).state;
  assert.ok(editor.field(blameGhostField));
  for (const transaction of [
    { effects: setBlame.of(null) },
    { changes: { from: 0, insert: "x" } },
    { selection: { anchor: 0 } },
  ]) {
    assert.equal(editor.update(transaction).state.field(blameGhostField), null);
  }
});

test("the ghost goes a gap after the line's end, centred on its last row, and uses the room to the editor's edge", () => {
  // A 16px body; a heading row from 100 to 140 ending at x = 300.
  const place = placeGhost({ right: 300, top: 100, bottom: 140 }, 1000, 16);
  assert.deepEqual(place, { left: 340, middle: 120, width: 644 });
});

test("the ghost is not shown when less than ten ems fit, so it never wraps", () => {
  const end = { right: 800, top: 0, bottom: 24 };
  // 800 + 40 gap, 16 kept at the edge: 159px left, under 160.
  assert.equal(placeGhost(end, 1015, 16), null);
  assert.equal(placeGhost(end, 1016, 16)?.width, 160);
});

test("the marker draws plain text at its place, and redraws only when something changed", () => {
  const marker = new BlameGhostMarker("<b>plain</b>", 10, 20, 300);
  const dom = { textContent: "", style: {} as Record<string, string> };
  assert.equal(marker.update(dom as never), true);
  assert.equal(dom.textContent, "<b>plain</b>");
  assert.deepEqual(dom.style, { left: "10px", top: "20px", maxWidth: "300px" });
  assert.equal(
    marker.eq(new BlameGhostMarker("<b>plain</b>", 10, 20, 300)),
    true,
  );
  assert.equal(
    marker.eq(new BlameGhostMarker("<b>plain</b>", 10, 21, 300)),
    false,
  );
  assert.equal(marker.eq(new BlameGhostMarker("other", 10, 20, 300)), false);
});

test("hovering is found by position, edges included", () => {
  const box = { left: 10, right: 20, top: 5, bottom: 15 };
  assert.equal(isInside(box, 10, 5), true);
  assert.equal(isInside(box, 20, 15), true);
  assert.equal(isInside(box, 21, 10), false);
  assert.equal(isInside(box, 15, 4), false);
});

function fakeDocument() {
  const appended: { remove(): void }[] = [];
  const element = () => {
    const node = {
      className: "",
      textContent: "",
      hidden: false,
      style: {} as Record<string, string>,
      attributes: {} as Record<string, string>,
      classList: { toggle() {} },
      ownerDocument: undefined as unknown,
      setAttribute(key: string, value: string) {
        this.attributes[key] = value;
      },
      addEventListener() {},
      getBoundingClientRect: () => ({ width: 100, height: 40 }),
      remove() {
        appended.splice(appended.indexOf(node), 1);
      },
    };
    node.ownerDocument = doc;
    return node;
  };
  const doc = {
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
      append: (node: { remove(): void }) => appended.push(node),
    },
    createElement: element,
  };
  return { doc, appended };
}

test("the tooltip shows the full message as text beside the ghost, and is removed with the view", () => {
  const { doc, appended } = fakeDocument();
  const tooltip = new BlameTooltip(doc as never);
  assert.equal(appended.length, 1);
  const tip = appended[0] as unknown as {
    className: string;
    textContent: string;
    hidden: boolean;
    style: Record<string, string>;
    attributes: Record<string, string>;
  };
  assert.equal(tip.className, "mw-gb-tooltip");
  assert.equal(tip.hidden, true);
  assert.equal(tip.attributes.role, "tooltip");
  tooltip.show("Ada\n<script>x</script>", {
    left: 200,
    right: 400,
    top: 100,
    bottom: 120,
  });
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, "Ada\n<script>x</script>");
  assert.ok(tip.style.left && tip.style.top);
  tooltip.hide();
  assert.equal(tip.hidden, true);
  tooltip.destroy();
  assert.equal(appended.length, 0);
});

test("the ghost keeps one quiet style on every line and leaves layout and clicks to the text", () => {
  const css = readFileSync("src/plugins/gitBlame/gitBlame.css", "utf8");
  const ghost = /\.mw-gb-ghost \{([^}]*)\}/s.exec(css)?.[1] ?? "";
  assert.match(ghost, /font-size:\s*calc\(0\.8 \* var\(--text-size\)\)/);
  assert.match(ghost, /font-weight:\s*normal/);
  assert.match(ghost, /font-family:\s*var\(--ui-font\)/);
  assert.match(ghost, /--vscode-git-blame-editorDecorationForeground/);
  assert.match(ghost, /white-space:\s*nowrap/);
  assert.match(ghost, /text-overflow:\s*ellipsis/);
  assert.match(ghost, /translateY\(-50%\)/);
  assert.doesNotMatch(ghost, /inline-block|margin/);
  assert.match(css, /\.mw-gb-layer \{\s*pointer-events:\s*none;/);
  assert.match(css, /\.is-source-mode \.mw-gb-ghost \{\s*display:\s*none;/);
  assert.match(css, /forced-colors/);
  assert.match(css, /\.mw-gb-tooltip \{[^}]*editorHoverWidget/s);
  assert.match(css, /white-space:\s*pre-wrap/);
});
