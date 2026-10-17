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
  body: "- detail one\n- detail two",
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
  const widget = cursor.value?.spec.widget as BlameEolWidget;
  assert.match(widget.text, /^Hi, Ada \(/);
  assert.match(widget.tooltip, /Ada\n/);
  assert.match(widget.tooltip, /Hi/);
  assert.match(widget.tooltip, /detail one/);
  editor = editor.update({
    effects: setBlameIdentity.of({ userEmail: "ADA@example.com" }),
  }).state;
  assert.match(
    (editor.field(blameDecorations).iter().value?.spec.widget as BlameEolWidget)
      .text,
    /^Hi, You \(/,
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

test("widget is decorative plain text, mounts tooltip host, and never captures events", () => {
  const widget = new BlameEolWidget(
    "<script>plain text</script>",
    "Ada\njust now\nSubject\n\nBody line",
  );
  const tips: { className: string; textContent: string; remove(): void }[] = [];
  const ownerDocument = {
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
      append(node: { className: string; textContent: string; remove(): void }) {
        tips.push(node);
      },
    },
    createElement(tag: string) {
      if (tag === "div") {
        return {
          className: "",
          textContent: "",
          hidden: true,
          style: {} as Record<string, string>,
          classList: { toggle() {} },
          setAttribute() {},
          addEventListener() {},
          remove() {
            const index = tips.indexOf(this as never);
            if (index >= 0) {
              tips.splice(index, 1);
            }
          },
          getBoundingClientRect: () => ({
            width: 10,
            height: 10,
            left: 0,
            right: 10,
            top: 0,
            bottom: 10,
          }),
        };
      }
      const element = {
        className: "",
        textContent: "",
        attributes: {} as Record<string, string>,
        ownerDocument,
        setAttribute(key: string, value: string) {
          this.attributes[key] = value;
        },
        addEventListener() {},
        getBoundingClientRect: () => ({
          width: 20,
          height: 10,
          left: 40,
          right: 60,
          top: 40,
          bottom: 50,
        }),
      };
      return element;
    },
  };
  const dom = widget.toDOM({
    dom: { ownerDocument },
  } as never) as unknown as {
    className: string;
    textContent: string;
    attributes: Record<string, string>;
  };
  assert.equal(dom.className, "mw-gb-eol");
  assert.equal(dom.textContent, widget.text);
  assert.equal(dom.attributes["aria-hidden"], "true");
  assert.equal(tips.length, 1);
  assert.equal(tips[0]?.className, "mw-gb-tooltip");
  assert.equal(tips[0]?.textContent, widget.tooltip);
  assert.equal(widget.ignoreEvent(), true);
  assert.equal(
    widget.eq(new BlameEolWidget(widget.text, widget.tooltip)),
    true,
  );
  assert.equal(widget.eq(new BlameEolWidget("other", widget.tooltip)), false);
  widget.destroy(dom as never);
  assert.equal(tips.length, 0);
});

test("quiet CSS matches VS Code blame decoration tokens and hover", () => {
  const css = readFileSync("src/plugins/gitBlame/gitBlame.css", "utf8");
  assert.match(css, /--vscode-git-blame-editorDecorationForeground/);
  assert.match(css, /margin:\s*0 0 0 50px/);
  assert.doesNotMatch(css, /--mw-git-ins-line|diffEditor/);
  assert.doesNotMatch(css, /opacity:\s*0\.5/);
  assert.doesNotMatch(css, /\.mw-gb-eol\s*\{[^}]*font-size:/s);
  assert.match(css, /forced-colors/);
  assert.match(css, /is-source-mode/);
  assert.match(css, /user-select: none/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /display:\s*inline-block/);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /max-width:/);
  assert.match(css, /\.mw-gb-tooltip/);
  assert.match(css, /editorHoverWidget/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.doesNotMatch(css, /pointer-events:\s*none/);
});

test("equal widget destroy cleans tooltip on reused DOM (eq ownership)", () => {
  const tips: { className: string; textContent: string; remove(): void }[] = [];
  const ownerDocument = {
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
      append(node: { className: string; textContent: string; remove(): void }) {
        tips.push(node);
      },
    },
    createElement(tag: string) {
      if (tag === "div") {
        return {
          className: "",
          textContent: "",
          hidden: true,
          style: {} as Record<string, string>,
          classList: { toggle() {} },
          setAttribute() {},
          addEventListener() {},
          remove() {
            const index = tips.indexOf(this as never);
            if (index >= 0) {
              tips.splice(index, 1);
            }
          },
          getBoundingClientRect: () => ({
            width: 10,
            height: 10,
            left: 0,
            right: 10,
            top: 0,
            bottom: 10,
          }),
        };
      }
      return {
        className: "",
        textContent: "",
        attributes: {} as Record<string, string>,
        ownerDocument,
        setAttribute(key: string, value: string) {
          this.attributes[key] = value;
        },
        addEventListener() {},
        getBoundingClientRect: () => ({
          width: 20,
          height: 10,
          left: 40,
          right: 60,
          top: 40,
          bottom: 50,
        }),
      };
    },
  };
  const a = new BlameEolWidget(
    "Ada, just now · Hi",
    "Ada\njust now\nHi\n\nBody",
  );
  const b = new BlameEolWidget(
    "Ada, just now · Hi",
    "Ada\njust now\nHi\n\nBody",
  );
  assert.equal(a.eq(b), true);
  const dom = a.toDOM({ dom: { ownerDocument } } as never);
  assert.equal(tips.length, 1);
  // CodeMirror reuses A's DOM for equal B; only B.destroy runs on removal.
  b.destroy(dom as never);
  assert.equal(tips.length, 0);
});
