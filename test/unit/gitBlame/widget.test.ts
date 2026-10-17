import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import {
  BlameEolWidget,
  blameDecorations,
  blameIdentityField,
  setBlameIdentity,
} from "../../../src/plugins/gitBlame/blameWidget";
import { blameField, setBlame } from "../../../src/plugins/gitBlame/state";
import type { GitBlameOk } from "../../../src/shared/git-blame";

const blame: GitBlameOk = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hi",
  line: 2,
};
function state() {
  return EditorState.create({
    doc: "first\nsecond\nthird",
    selection: { anchor: 7 },
    extensions: [blameField, blameIdentityField, blameDecorations],
  });
}

test("one non-block EOL widget after the main caret line", () => {
  let editor = state();
  assert.equal(editor.field(blameDecorations).size, 0);
  editor = editor.update({ effects: setBlame.of(blame) }).state;
  const decorations = editor.field(blameDecorations);
  assert.equal(decorations.size, 1);
  const cursor = decorations.iter();
  assert.equal(cursor.from, editor.doc.line(2).to);
  assert.equal(cursor.to, cursor.from);
  assert.equal(cursor.value?.spec.side, 1);
  assert.equal(cursor.value?.spec.block, false);
  assert.ok(cursor.value?.spec.widget instanceof BlameEolWidget);
  assert.match((cursor.value?.spec.widget as BlameEolWidget).text, /^Ada,/);
  editor = editor.update({
    effects: setBlameIdentity.of({ userEmail: "ADA@example.com" }),
  }).state;
  assert.match(
    (editor.field(blameDecorations).iter().value?.spec.widget as BlameEolWidget)
      .text,
    /^You,/,
  );
});

test("empty/non-ok, doc edit and caret-line move remove the widget synchronously", () => {
  let editor = state().update({ effects: setBlame.of(blame) }).state;
  editor = editor.update({ selection: { anchor: 8 } }).state;
  assert.equal(editor.field(blameDecorations).size, 1);
  for (const transaction of [
    { effects: setBlame.of(null) },
    { changes: { from: 0, insert: "x" } },
    { selection: { anchor: 0 } },
  ]) {
    const changed = editor.update(transaction).state;
    assert.equal(changed.field(blameDecorations).size, 0);
  }
});

test("widget is decorative plain text and never captures events", () => {
  const widget = new BlameEolWidget("<script>plain text</script>");
  const element = {
    className: "",
    textContent: "",
    attributes: {} as Record<string, string>,
    setAttribute(key: string, value: string) {
      this.attributes[key] = value;
    },
  };
  const dom = widget.toDOM({
    dom: { ownerDocument: { createElement: () => element } },
  } as never);
  assert.equal(dom.className, "mw-gb-eol");
  assert.equal(dom.textContent, widget.text);
  assert.equal(element.attributes["aria-hidden"], "true");
  assert.equal(widget.ignoreEvent(), true);
  assert.equal(widget.eq(new BlameEolWidget(widget.text)), true);
  assert.equal(widget.eq(new BlameEolWidget("other")), false);
});

test("quiet CSS consumes description foreground, supports forced colors, and hides in Source", () => {
  const css = readFileSync("src/plugins/gitBlame/gitBlame.css", "utf8");
  assert.match(css, /var\(--vscode-descriptionForeground, var\(--muted\)\)/);
  assert.doesNotMatch(css, /--mw-git-ins-line|diffEditor/);
  assert.match(css, /forced-colors/);
  assert.match(css, /is-source-mode/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /user-select: none/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /opacity:\s*0\.5/);
});
