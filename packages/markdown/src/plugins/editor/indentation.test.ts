import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import {
  indentTab,
  outdentTab,
  outdentBackspace,
  indentationTabKey,
  indentationBracketKey,
} from "./indentation";

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

test("Backspace at nested list text start outdents like Obsidian (BH-052)", () => {
  assert.equal(
    apply("- alpha\n  - nested\n    - |deep", outdentBackspace, "  "),
    "- alpha\n  - nested\n  - |deep",
  );
  assert.equal(
    apply("- alpha\n  - |nested\n    - deep", outdentBackspace, "  "),
    "- alpha\n- |nested\n  - deep",
  );
  assert.equal(
    apply("- [ ] a\n  - [ ] |b", outdentBackspace, "  "),
    "- [ ] a\n- [ ] |b",
  );
  // Mid-text Backspace is not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "  - deep",
        selection: { anchor: 6 },
        extensions: [indentUnit.of("  ")],
      }),
      dispatch: () => undefined,
    }),
    false,
  );
});

test("Backspace at top-level list text start unwraps marker (BH-053)", () => {
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
  assert.equal(apply("- [ ] |task", outdentBackspace, "  "), "|task");
  assert.equal(apply("1. |one", outdentBackspace, "  "), "|one");
  assert.equal(apply("* |star", outdentBackspace, "  "), "|star");
  // Nested still outdents, does not unwrap.
  assert.equal(apply("- a\n  - |b", outdentBackspace, "  "), "- a\n- |b");
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

/** BH-040: Tab / Shift+Tab map to indent actions before Vim can swallow them. */
test("indentationTabKey maps Tab and Shift+Tab (BH-040)", () => {
  assert.equal(indentationTabKey({ key: "Tab", shiftKey: false }), "indent");
  assert.equal(indentationTabKey({ key: "Tab", shiftKey: true }), "outdent");
  assert.equal(
    indentationTabKey({ key: "Tab", shiftKey: false, ctrlKey: true }),
    undefined,
  );
  assert.equal(
    indentationTabKey({ key: "Tab", shiftKey: false, isComposing: true }),
    undefined,
  );
  assert.equal(indentationTabKey({ key: "Enter", shiftKey: false }), undefined);
});

/** BH-047: Ctrl/Cmd+[ outdent, Ctrl/Cmd+] indent (beats Vim INSERT Esc on [). */
test("indentationBracketKey maps Mod-[ / Mod-] (BH-047)", () => {
  assert.equal(
    indentationBracketKey(
      { key: "]", shiftKey: false, ctrlKey: true, metaKey: false },
      false,
    ),
    "indent",
  );
  assert.equal(
    indentationBracketKey(
      { key: "[", shiftKey: false, ctrlKey: true, metaKey: false },
      false,
    ),
    "outdent",
  );
  assert.equal(
    indentationBracketKey(
      { key: "[", shiftKey: false, ctrlKey: false, metaKey: true },
      true,
    ),
    "outdent",
  );
  assert.equal(
    indentationBracketKey(
      { key: "]", keyCode: 221, shiftKey: false, ctrlKey: true },
      false,
    ),
    "indent",
  );
  assert.equal(
    indentationBracketKey(
      { key: "[", keyCode: 219, shiftKey: false, ctrlKey: true },
      false,
    ),
    "outdent",
  );
  // No modifier → not ours (vim Esc is Ctrl+[ only when we own it via capture).
  assert.equal(
    indentationBracketKey({ key: "[", shiftKey: false }, false),
    undefined,
  );
  assert.equal(
    indentationBracketKey({ key: "[", shiftKey: true, ctrlKey: true }, false),
    undefined,
  );
  // Mac: Ctrl+[ is not Mod (Cmd); leave bare Ctrl for vim Esc on macOS.
  assert.equal(
    indentationBracketKey(
      { key: "[", shiftKey: false, ctrlKey: true, metaKey: false },
      true,
    ),
    undefined,
  );
  // Ctrl+[ often reports key=Escape; physical code still outdents (BH-047).
  assert.equal(
    indentationBracketKey(
      {
        key: "Escape",
        code: "BracketLeft",
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
      },
      false,
    ),
    "outdent",
  );
  // Remapped Ctrl+[ → Escape (no BracketLeft code) still outdents.
  assert.equal(
    indentationBracketKey(
      {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
      },
      false,
    ),
    "outdent",
  );
  // Bare Escape (no Mod) must not outdent — early Mod gate.
  assert.equal(
    indentationBracketKey(
      {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      },
      false,
    ),
    undefined,
  );
  // Linux Chromium: Ctrl+[ → key=Escape, code=BracketLeft, ctrlKey cleared.
  assert.equal(
    indentationBracketKey(
      {
        key: "Escape",
        code: "BracketLeft",
        keyCode: 27,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      },
      false,
    ),
    "outdent",
  );
  assert.equal(
    indentationBracketKey(
      {
        key: "]",
        code: "BracketRight",
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
      },
      false,
    ),
    "indent",
  );
});
