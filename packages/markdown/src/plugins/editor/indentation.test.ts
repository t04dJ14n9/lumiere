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
  assert.equal(apply("# he|ading", indentTab), "# he|ading");
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

test("Backspace at blockquote list text start unwraps marker (BH-054)", () => {
  assert.equal(apply("> - |item", outdentBackspace, "  "), "> |item");
  assert.equal(apply("> - [ ] |task", outdentBackspace, "  "), "> |task");
  assert.equal(apply("> 1. |one", outdentBackspace, "  "), "> |one");
  assert.equal(apply("> > - |nested", outdentBackspace, "  "), "> > |nested");
  // Plain nested still outdents (BH-052).
  assert.equal(apply("- a\n  - |b", outdentBackspace, "  "), "- a\n- |b");
});

test("Backspace at nested quote-list text start outdents inside quotes (BH-055)", () => {
  assert.equal(
    apply("> - parent\n>   - |child", outdentBackspace, "  "),
    "> - parent\n> - |child",
  );
  assert.equal(
    apply("> - parent\n>     - |deep", outdentBackspace, "  "),
    "> - parent\n>   - |deep",
  );
  assert.equal(
    apply("> - [ ] a\n>   - [ ] |b", outdentBackspace, "  "),
    "> - [ ] a\n> - [ ] |b",
  );
  // Top-level quote (no nest) unwraps marker (BH-054), does not outdent.
  assert.equal(apply("> - |item", outdentBackspace, "  "), "> |item");
});

test("Backspace at blockquote text start unwraps one quote level (BH-056)", () => {
  assert.equal(apply("> |quoted", outdentBackspace, "  "), "|quoted");
  assert.equal(apply("> > |nested", outdentBackspace, "  "), "> |nested");
  assert.equal(apply("> > > |deep", outdentBackspace, "  "), "> > |deep");
  // Quote+list still unwraps marker (BH-054), not quote level.
  assert.equal(apply("> - |item", outdentBackspace, "  "), "> |item");
});

test("Tab indents a list under blockquote after the > (BH-057)", () => {
  assert.equal(apply("> - |alpha", indentTab, "  "), ">   - |alpha");
  assert.equal(apply("> - [ ] |task", indentTab, "  "), ">   - [ ] |task");
  assert.equal(apply("> 1. |one", indentTab, "  "), ">   1. |one");
  // Children deepen with the parent.
  assert.equal(
    apply("> - |parent\n>   - child", indentTab, "  "),
    ">   - |parent\n>     - child",
  );
  // Already nested: one more unit.
  assert.equal(apply(">   - |child", indentTab, "  "), ">     - |child");
});

test("Shift+Tab outdents a list under blockquote after the > (BH-057)", () => {
  assert.equal(apply(">   - |child", outdentTab, "  "), "> - |child");
  assert.equal(apply(">     - |deep", outdentTab, "  "), ">   - |deep");
  // Top-level under quote: nothing to outdent (keep focus).
  assert.equal(apply("> - |top", outdentTab, "  "), "> - |top");
  assert.equal(
    apply(">   - |parent\n>     - child", outdentTab, "  "),
    "> - |parent\n>   - child",
  );
});

test("Tab nests a plain blockquote instead of tab-before-> (BH-058)", () => {
  assert.equal(apply("> |quoted", indentTab, "  "), "> > |quoted");
  assert.equal(apply("> > |nested", indentTab, "  "), "> > > |nested");
  assert.equal(apply("> quoted| text", indentTab, "  "), "> > quoted| text");
  // Callout opener: no-op (do not tab-before-> or nest).
  assert.equal(apply("> [!note] |Title", indentTab, "  "), "> [!note] |Title");
  // Quote-list still nests indent after > (BH-057), not another >.
  assert.equal(apply("> - |item", indentTab, "  "), ">   - |item");
});

test("Shift+Tab unwraps a plain blockquote level (BH-058)", () => {
  assert.equal(apply("> > |nested", outdentTab, "  "), "> |nested");
  assert.equal(apply("> |top", outdentTab, "  "), "|top");
  assert.equal(apply("> > > |deep", outdentTab, "  "), "> > |deep");
  assert.equal(apply("> [!note] |Title", outdentTab, "  "), "> [!note] |Title");
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

test("Backspace at ATX heading text start unwraps marker (BH-061)", () => {
  assert.equal(
    apply("# |HeadingAlpha", outdentBackspace, "  "),
    "|HeadingAlpha",
  );
  assert.equal(apply("## |Nested", outdentBackspace, "  "), "|Nested");
  assert.equal(apply("### |Deep", outdentBackspace, "  "), "|Deep");
  assert.equal(apply("  # |Indented", outdentBackspace, "  "), "|Indented");
  // Mid-title / no-space fake heading: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "# MidTitle",
        selection: { anchor: 5 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "#NoSpace",
        selection: { anchor: 1 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // List/quote still take precedence.
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
  assert.equal(apply("> |quoted", outdentBackspace, "  "), "|quoted");
});

test("Backspace at list/task ATX heading text start unwraps marker (BH-063)", () => {
  assert.equal(apply("- # |ListHead", outdentBackspace, "  "), "- |ListHead");
  assert.equal(apply("* # |StarHead", outdentBackspace, "  "), "* |StarHead");
  assert.equal(apply("1. # |OrdHead", outdentBackspace, "  "), "1. |OrdHead");
  assert.equal(
    apply("- [ ] # |TaskHead", outdentBackspace, "  "),
    "- [ ] |TaskHead",
  );
  assert.equal(
    apply("- [x] # |DoneHead", outdentBackspace, "  "),
    "- [x] |DoneHead",
  );
  assert.equal(
    apply("> - # |QuoteList", outdentBackspace, "  "),
    "> - |QuoteList",
  );
  assert.equal(
    apply("> - [ ] # |QuoteTask", outdentBackspace, "  "),
    "> - [ ] |QuoteTask",
  );
  assert.equal(apply("- ## |Nested", outdentBackspace, "  "), "- |Nested");
  // Mid-title / no-space under list: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "- # MidTitle",
        selection: { anchor: 7 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "- #NoSpace",
        selection: { anchor: 3 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // Plain / quoted ATX and list unwrap unchanged (BH-061 / 062 / 053).
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
  assert.equal(apply("> # |Quoted", outdentBackspace, "  "), "> |Quoted");
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
});

test("Backspace at callout title text start unwraps marker (BH-064)", () => {
  assert.equal(apply("> [!NOTE] |Title", outdentBackspace, "  "), "> |Title");
  assert.equal(apply("> [!tip] |Hint", outdentBackspace, "  "), "> |Hint");
  assert.equal(apply("> [!warning] |Warn", outdentBackspace, "  "), "> |Warn");
  assert.equal(
    apply("> > [!NOTE] |Nested", outdentBackspace, "  "),
    "> > |Nested",
  );
  // Mid-title / no-space: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> [!NOTE] MidTitle",
        selection: { anchor: 12 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> [!NOTE]NoSpace",
        selection: { anchor: 9 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // ATX / list / quote still unwrap.
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
  assert.equal(apply("- # |ListHead", outdentBackspace, "  "), "- |ListHead");
  assert.equal(apply("> |quoted", outdentBackspace, "  "), "|quoted");
});

test("Backspace at folded callout title unwraps marker including fold (BH-078)", () => {
  assert.equal(apply("> [!NOTE]- |Title", outdentBackspace, "  "), "> |Title");
  assert.equal(apply("> [!tip]+ |Hint", outdentBackspace, "  "), "> |Hint");
  assert.equal(apply("> [!warning]- |Warn", outdentBackspace, "  "), "> |Warn");
  assert.equal(
    apply("> > [!NOTE]+ |Nested", outdentBackspace, "  "),
    "> > |Nested",
  );
  // Fold with tab before title.
  assert.equal(apply("> [!NOTE]-\t|Title", outdentBackspace, "  "), "> |Title");
  // No space after fold marker: leave alone.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> [!NOTE]-NoSpace",
        selection: { anchor: 10 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // Plain callout (BH-064) and quote unwrap still work.
  assert.equal(apply("> [!NOTE] |Plain", outdentBackspace, "  "), "> |Plain");
  assert.equal(apply("> |quoted", outdentBackspace, "  "), "|quoted");
});

test("Backspace at quoted ATX heading text start unwraps marker (BH-062)", () => {
  assert.equal(apply("> # |Title", outdentBackspace, "  "), "> |Title");
  assert.equal(apply("> ## |Nested", outdentBackspace, "  "), "> |Nested");
  assert.equal(apply("> > # |Deep", outdentBackspace, "  "), "> > |Deep");
  assert.equal(apply(">  # |Spaced", outdentBackspace, "  "), "> |Spaced");
  // Mid-title / no-space under quote: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> # MidTitle",
        selection: { anchor: 7 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> #NoSpace",
        selection: { anchor: 3 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // Plain ATX / list / quote still unwrap (BH-061 / 053 / 056).
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
  assert.equal(apply("> |quoted", outdentBackspace, "  "), "|quoted");
});

test("Backspace at footnote definition body start unwraps marker (BH-065)", () => {
  assert.equal(
    apply("[^note1]: |def line", outdentBackspace, "  "),
    "|def line",
  );
  assert.equal(apply("[^a]: |body", outdentBackspace, "  "), "|body");
  assert.equal(
    apply("  [^ind]: |Indented", outdentBackspace, "  "),
    "|Indented",
  );
  assert.equal(apply("> [^q]: |Quoted", outdentBackspace, "  "), "> |Quoted");
  // Mid-body / no-space: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "[^n]: MidBody",
        selection: { anchor: 8 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "[^n]:NoSpace",
        selection: { anchor: 5 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // Callout / ATX still unwrap.
  assert.equal(apply("> [!NOTE] |Title", outdentBackspace, "  "), "> |Title");
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
});

test("Tab on setext title or underline is a no-op (BH-066)", () => {
  // Hard tab indent would turn the title into a CodeBlock in one press.
  assert.equal(apply("Tit|le\n=======", indentTab), "Tit|le\n=======");
  assert.equal(apply("Title|\n-------", indentTab), "Title|\n-------");
  assert.equal(apply("|Title\n=======", indentTab), "|Title\n=======");
  assert.equal(apply("Title\n===|====", indentTab), "Title\n===|====");
  assert.equal(apply("Title\n---|----", indentTab, "  "), "Title\n---|----");
  // Two-space unit: still no-op (would need two Tabs to reach CodeBlock).
  assert.equal(apply("Tit|le\n=======", indentTab, "  "), "Tit|le\n=======");
  // Host GUI fixture (integ BH066Setext.md): title start + underline start.
  const hostGui = "Setext Title\n=======\n\nBody under heading.";
  assert.equal(
    apply("|Setext Title\n=======\n\nBody under heading.", indentTab),
    `|${hostGui}`,
  );
  assert.equal(
    apply("Setext Title\n|=======\n\nBody under heading.", indentTab),
    `Setext Title\n|=======\n\nBody under heading.`,
  );
  assert.equal(
    apply("Setext |Title\n=======\n\nBody under heading.", indentTab),
    "Setext |Title\n=======\n\nBody under heading.",
  );
  // Plain ATX no-ops (BH-087); blank between title-ish and underline still indents.
  assert.equal(apply("# he|ading", indentTab), "# he|ading");
  assert.equal(apply("Tit|le\n\n=======", indentTab), "\tTit|le\n\n=======");
  // Lone underline line without a title above is not setext.
  assert.equal(apply("===|====", indentTab), "\t===|====");
});

test("Tab on footnote definition opener is a no-op (BH-067)", () => {
  assert.equal(apply("[^n]: |body", indentTab), "[^n]: |body");
  assert.equal(apply("[^note1]: def |line", indentTab), "[^note1]: def |line");
  assert.equal(apply("|[^a]: x", indentTab), "|[^a]: x");
  assert.equal(apply("> [^q]: |Quoted", indentTab, "  "), "> [^q]: |Quoted");
  // Continuation under def still indents (not the opener line).
  assert.equal(
    apply("[^n]: body\n\t|cont", indentTab),
    "[^n]: body\n\t\t|cont",
  );
  // Plain still indents.
  assert.equal(apply("pla|in", indentTab), "\tpla|in");
});

test("Tab on quoted setext title or underline is a no-op (BH-068)", () => {
  // nestQuote would turn `> Title` into `> > Title` and break the heading.
  assert.equal(
    apply("> Tit|le\n> =======", indentTab, "  "),
    "> Tit|le\n> =======",
  );
  assert.equal(
    apply("> Title|\n> -------", indentTab, "  "),
    "> Title|\n> -------",
  );
  assert.equal(
    apply("> |Title\n> =======", indentTab, "  "),
    "> |Title\n> =======",
  );
  assert.equal(
    apply("> Title\n> ===|====", indentTab, "  "),
    "> Title\n> ===|====",
  );
  assert.equal(
    apply("> > Tit|le\n> > =====", indentTab, "  "),
    "> > Tit|le\n> > =====",
  );
  // Plain quote still nests; mismatched quote depth is not a setext pair.
  assert.equal(apply("> |quoted", indentTab, "  "), "> > |quoted");
  assert.equal(
    apply("> Tit|le\n======", indentTab, "  "),
    "> > Tit|le\n======",
  );
});

test("Backspace/Shift+Tab on quoted setext does not unwrap one > (BH-068)", () => {
  // Title start: BH-083 unwraps (delete underline); keep matching `>`.
  assert.equal(
    apply("> |Title\n> =======", outdentBackspace, "  "),
    "> |Title",
  );
  // Underline start: BH-074 unwraps (delete underline).
  assert.equal(
    apply("> Title\n> |=======", outdentBackspace, "  "),
    "> Title|",
  );
  assert.equal(
    apply("> Tit|le\n> =======", outdentTab, "  "),
    "> Tit|le\n> =======",
  );
  // Plain quote still unwraps (BH-056 / BH-058).
  assert.equal(apply("> |plain", outdentBackspace, "  "), "|plain");
  assert.equal(apply("> |plain", outdentTab, "  "), "|plain");
});

test("Tab on link reference definition is a no-op (BH-069)", () => {
  assert.equal(
    apply("[lab]: |https://ex.com", indentTab),
    "[lab]: |https://ex.com",
  );
  assert.equal(
    apply("[lab]: https://ex.com|", indentTab),
    "[lab]: https://ex.com|",
  );
  assert.equal(apply("|[ref]: url", indentTab), "|[ref]: url");
  assert.equal(apply("[x]: <|url>", indentTab, "  "), "[x]: <|url>");
  assert.equal(
    apply("> [lab]: |https://ex.com", indentTab, "  "),
    "> [lab]: |https://ex.com",
  );
  // Footnote defs are handled by BH-067 (no-op), not link-ref.
  assert.equal(apply("[^n]: |body", indentTab), "[^n]: |body");
  // Plain still indents.
  assert.equal(apply("pla|in", indentTab), "\tpla|in");
});

test("Tab on quoted ATX heading is a no-op (BH-070)", () => {
  assert.equal(apply("> # he|ading", indentTab, "  "), "> # he|ading");
  assert.equal(apply("> ## Title|", indentTab, "  "), "> ## Title|");
  assert.equal(apply("> > # |Nested", indentTab, "  "), "> > # |Nested");
  assert.equal(apply("> # |Alpha", indentTab), "> # |Alpha");
  // Plain ATX no-ops (BH-087).
  assert.equal(apply("# he|ading", indentTab), "# he|ading");
  // Plain quote still nests.
  assert.equal(apply("> |quoted", indentTab, "  "), "> > |quoted");
  // Callout opener still no-op (BH-058).
  assert.equal(apply("> [!note] |Title", indentTab, "  "), "> [!note] |Title");
});

test("Backspace at link reference destination start unwraps marker (BH-071)", () => {
  assert.equal(
    apply("[lab]: |https://ex.com", outdentBackspace, "  "),
    "|https://ex.com",
  );
  assert.equal(apply("[ref]: |url", outdentBackspace, "  "), "|url");
  assert.equal(
    apply("  [ind]: |Indented", outdentBackspace, "  "),
    "|Indented",
  );
  assert.equal(
    apply("> [q]: |https://ex.com", outdentBackspace, "  "),
    "> |https://ex.com",
  );
  assert.equal(apply("[x]: |<url>", outdentBackspace, "  "), "|<url>");
  // Mid-destination / no-space: not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "[lab]: MidUrl",
        selection: { anchor: 10 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "[lab]:NoSpace",
        selection: { anchor: 6 },
      }),
      dispatch: () => undefined,
    }),
    false,
  );
  // Footnote still unwraps (BH-065); ATX still unwraps.
  assert.equal(apply("[^n]: |body", outdentBackspace, "  "), "|body");
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
});

test("Backspace at setext underline start unwraps heading (BH-074)", () => {
  assert.equal(apply("Title\n|=========", outdentBackspace, "  "), "Title|");
  assert.equal(apply("Title\n|---------", outdentBackspace, "  "), "Title|");
  assert.equal(
    apply("Hello world\n|===", outdentBackspace, "  "),
    "Hello world|",
  );
  // Mid-underline is not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "Title\n=========",
        selection: { anchor: "Title\n==".length },
      }),
      dispatch: () => {},
    }),
    false,
  );
  // Orphan underline (no title) is not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "=========",
        selection: { anchor: 0 },
      }),
      dispatch: () => {},
    }),
    false,
  );
  // List/quote Backspace still wins on non-setext.
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
});

test("Backspace at quoted setext underline start unwraps heading (BH-074)", () => {
  assert.equal(
    apply("> Title\n> |=========", outdentBackspace, "  "),
    "> Title|",
  );
  assert.equal(
    apply("> > Deep\n> > |---", outdentBackspace, "  "),
    "> > Deep|",
  );
  // Mismatched quote depth: leave alone (do not join).
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "> Title\n=========",
        selection: { anchor: "> Title\n".length },
      }),
      dispatch: () => {},
    }),
    false,
  );
});

test("Backspace at setext title start unwraps heading (BH-083)", () => {
  assert.equal(apply("|Title\n=========", outdentBackspace, "  "), "|Title");
  assert.equal(apply("|Title\n---------", outdentBackspace, "  "), "|Title");
  assert.equal(
    apply("|Hello world\n===", outdentBackspace, "  "),
    "|Hello world",
  );
  // Mid-title is not ours.
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "Title\n=========",
        selection: { anchor: 2 },
      }),
      dispatch: () => {},
    }),
    false,
  );
  // No underline below: leave alone (plain paragraph / quote unwrap later).
  assert.equal(
    outdentBackspace({
      state: EditorState.create({
        doc: "Title\n\nbody",
        selection: { anchor: 0 },
      }),
      dispatch: () => {},
    }),
    false,
  );
  // Underline unwrap (BH-074) still works.
  assert.equal(apply("Title\n|=========", outdentBackspace, "  "), "Title|");
  // ATX / list still unwrap.
  assert.equal(apply("# |Plain", outdentBackspace, "  "), "|Plain");
  assert.equal(apply("- |top", outdentBackspace, "  "), "|top");
});

test("Backspace at quoted setext title start unwraps heading (BH-083)", () => {
  assert.equal(
    apply("> |Title\n> =========", outdentBackspace, "  "),
    "> |Title",
  );
  assert.equal(
    apply("> > |Deep\n> > ---", outdentBackspace, "  "),
    "> > |Deep",
  );
  // Mismatched quote depth: do not unwrap setext (quote path may still run).
  assert.equal(
    apply("> |Title\n=========", outdentBackspace, "  "),
    "|Title\n=========",
  );
});
test("Tab on plain ATX heading is a no-op (BH-087)", () => {
  assert.equal(apply("# he|ading", indentTab), "# he|ading");
  assert.equal(apply("## Title|", indentTab), "## Title|");
  assert.equal(apply("|### Title", indentTab), "|### Title");
  assert.equal(apply("###### |H6", indentTab), "###### |H6");
  assert.equal(apply("   # |Indented3", indentTab), "   # |Indented3");
  assert.equal(apply("# he|ading", indentTab, "  "), "# he|ading");
  // List-prefixed ATX still indents the list item (BH-057).
  assert.equal(apply("- # |Title", indentTab, "  "), "  - # |Title");
  // Plain paragraph still indents.
  assert.equal(apply("some| text", indentTab), "\tsome| text");
  // Setext still no-op (BH-066).
  assert.equal(apply("Tit|le\n=======", indentTab), "Tit|le\n=======");
  // Callout opener still no-op (BH-058).
  assert.equal(apply("> [!note] |Title", indentTab, "  "), "> [!note] |Title");
});

test("Tab on plain thematic break is a no-op (BH-088)", () => {
  assert.equal(apply("---|", indentTab), "---|");
  assert.equal(apply("|***", indentTab), "|***");
  assert.equal(apply("___|", indentTab), "___|");
  assert.equal(apply("- - -|", indentTab), "- - -|");
  assert.equal(apply("* * *|", indentTab), "* * *|");
  assert.equal(apply("   ---|", indentTab), "   ---|");
  assert.equal(apply("---|", indentTab, "  "), "---|");
  // Setext underline still no-op via BH-066 (not HR).
  assert.equal(apply("Title\n---|", indentTab), "Title\n---|");
  // List item still indents (not a thematic break).
  assert.equal(apply("- |item", indentTab, "  "), "  - |item");
  // Plain paragraph still indents.
  assert.equal(apply("some| text", indentTab), "\tsome| text");
});
