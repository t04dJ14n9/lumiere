import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { indentTab, outdentTab } from "./indentation";

type Command = typeof indentTab;

/** Runs `command` with the caret at `|` (or selection `«...»`). */
function apply(text: string, command: Command, unit = "\t"): string {
  const anchor = text.indexOf("«") >= 0 ? text.indexOf("«") : text.indexOf("|");
  const plain = text.replace(/[«»|]/g, "");
  const head = text.indexOf("»") >= 0 ? text.indexOf("»") - 1 : anchor;
  let state = EditorState.create({
    doc: plain,
    selection: { anchor, head },
    extensions: [indentUnit.of(unit), EditorState.tabSize.of(4)],
  });
  assert.ok(
    command({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    }),
  );
  if (!state.selection.main.empty) {
    return state.doc.toString();
  }
  const at = state.selection.main.head;
  return state.sliceDoc(0, at) + "|" + state.sliceDoc(at);
}

test("Tab indents a list item with its children, wherever the caret is", () => {
  assert.equal(
    apply("- one\n- tw|o\n  - child\n- three", indentTab, "  "),
    "- one\n  - tw|o\n    - child\n- three",
  );
  assert.equal(apply("- one\n- |", indentTab), "- one\n\t- |");
  // A numbered item that starts a new level counts from 1, as in Obsidian.
  assert.equal(apply("1. one\n2. two|", indentTab), "1. one\n\t1. two|");
  assert.equal(apply("- [ ] task|", indentTab, "  "), "  - [ ] task|");
});

test("Shift+Tab outdents a list item with its children", () => {
  assert.equal(
    apply("- one\n\t- tw|o\n\t\t- child", outdentTab),
    "- one\n- tw|o\n\t- child",
  );
  assert.equal(apply("- top|", outdentTab), "- top|");
});

test("Tab elsewhere indents the line, wherever the caret is, as in Obsidian", () => {
  assert.equal(apply("some| text", indentTab), "\tsome| text");
  assert.equal(apply("some| text", indentTab, "    "), "    some| text");
  assert.equal(apply("# he|ading", indentTab), "\t# he|ading");
  assert.equal(apply("«a\nb»", indentTab), "\ta\n\tb");
  assert.equal(apply("\tpla|in", outdentTab), "pla|in");
});

test("Shift+Tab with nothing to outdent still keeps focus in the note", () => {
  assert.equal(apply("pla|in", outdentTab), "pla|in");
});

test("moving a numbered item renumbers the lists it leaves and joins", () => {
  assert.equal(apply("1. a\n2. b|\n3. c", indentTab), "1. a\n\t1. b|\n2. c");
  assert.equal(
    apply("1. a\n\t1. b\n2. c|", indentTab),
    "1. a\n\t1. b\n\t2. c|",
  );
  assert.equal(apply("1. a\n\t1. b|", outdentTab), "1. a\n2. b|");
  assert.equal(apply("1. a\n\t1. b|\n2. c", outdentTab), "1. a\n2. b|\n3. c");
});
