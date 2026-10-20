import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { insertFootnote } from "./edit";
import { headings } from "../../markdown/metadata/headings";

test("inserting on an ATX or Setext heading leaves its text and outline intact", () => {
  for (const heading of [
    "# Footnotes",
    "  ## Footnotes ##",
    "Footnotes\n========",
    "Footnotes\ncontinued title\n--------",
  ]) {
    const doc = `${heading}\n\nBody[^1]\n\n[^1]: Existing\n`;
    for (let anchor = 0; anchor <= heading.length; anchor++) {
      const state = EditorState.create({ doc, selection: { anchor } });
      const edit = insertFootnote(state);
      const next = state.update(edit).state;
      assert.equal(
        next.doc.toString(),
        `${heading}\n\n[^2]\n\nBody[^1]\n\n[^1]: Existing\n\n[^2]: \n`,
        `${JSON.stringify(heading)}, caret ${anchor}`,
      );
      assert.deepEqual(
        headings(next.doc).map(({ label, level }) => ({ label, level })),
        headings(state.doc).map(({ label, level }) => ({ label, level })),
      );
      assert.equal(edit.reference, heading.length + 6);
      assert.equal(next.selection.main.head, edit.reference);
    }
  }
});

test("heading insertion supports EOF and selected heading text without changing ordinary text", () => {
  const state = EditorState.create({
    doc: "# Footnotes",
    selection: { anchor: 0, head: 4 },
  });
  assert.equal(
    state.update(insertFootnote(state)).newDoc.toString(),
    "# Footnotes\n\n[^1]\n\n[^1]: \n",
  );
  const ending = EditorState.create({
    doc: "# Footnotes\nBody",
    selection: { anchor: 11, head: 12 },
  });
  const edit = insertFootnote(ending);
  const next = ending.update(edit).state;
  assert.equal(next.selection.main.empty, true);
  assert.equal(next.selection.main.head, edit.reference);
  const code = EditorState.create({
    doc: "```\n# text\n```",
    selection: { anchor: 4 },
  });
  assert.equal(
    code.update(insertFootnote(code)).newDoc.toString(),
    "```\n[^1]# text\n```\n\n[^1]: \n",
  );
});
test("insertion uses an unused label, leaves the caret after the reference and supports EOF", () => {
  for (const source of ["", "[^1]: existing\n\nbody"]) {
    const state = EditorState.create({
      doc: source,
      selection: { anchor: source.length },
    });
    const edit = insertFootnote(state);
    const next = state.update(edit).state;
    const label = source ? 2 : 1;
    assert.equal(
      next.doc.toString(),
      `${source}[^${label}]\n\n[^${label}]: \n`,
    );
    // As in Obsidian 1.14: the caret stays after the reference, and a
    // popover edits the definition.
    assert.equal(next.selection.main.head, source.length + 4);
    assert.equal(edit.label, String(label));
    assert.equal(edit.reference, source.length + 4);
  }
  // One blank line before the definition, whatever the note ends with
  // (measured in Obsidian 1.14.4).
  for (const [source, ending] of [
    ["more", "more\n\n[^1]: \n"],
    ["more\n", "more\n\n[^1]: \n"],
    ["more\n\n\n", "more\n\n\n[^1]: \n"],
  ]) {
    const state = EditorState.create({ doc: source! });
    assert.equal(
      state.update(insertFootnote(state)).newDoc.toString(),
      `[^1]${ending}`,
    );
  }
  // EOF with trailing blanks: blanks stay before the reference, so the
  // definition still needs its own blank line after it (Obsidian 1.14).
  for (const [source, expected] of [
    ["body\n", "body\n[^1]\n\n[^1]: \n"],
    ["body\n\n", "body\n\n[^1]\n\n[^1]: \n"],
    ["body\n\n\n", "body\n\n\n[^1]\n\n[^1]: \n"],
    ["\n\n", "\n\n[^1]\n\n[^1]: \n"],
  ] as const) {
    const atEnd = EditorState.create({
      doc: source,
      selection: { anchor: source.length },
    });
    const next = atEnd.update(insertFootnote(atEnd)).state;
    assert.equal(next.doc.toString(), expected, JSON.stringify(source));
    assert.equal(next.selection.main.head, source.length + 4);
  }
  // Caret on a trailing blank line (not past the last newline) still gets a
  // blank line between the reference and the definition.
  const onBlank = EditorState.create({
    doc: "body\n\n",
    selection: { anchor: 5 },
  });
  assert.equal(
    onBlank.update(insertFootnote(onBlank)).newDoc.toString(),
    "body\n[^1]\n\n[^1]: \n",
  );
  // As in Obsidian, the reference goes before the selection, which stays.
  const state = EditorState.create({
    doc: "some text",
    selection: { anchor: 0, head: 4 },
  });
  assert.equal(
    state.update(insertFootnote(state)).newDoc.toString(),
    "[^1]some text\n\n[^1]: \n",
  );
});

test("the popover writes a definition's continued lines with a tab, and reads them back", async () => {
  const { Text } = await import("@codemirror/state");
  const { definitionChange, definitionText } =
    await import("./definition-popover");
  const doc = Text.of("a[^1]\n\n[^1]: \n".split("\n"));
  const change = definitionChange(doc, "1", "My note\nsecond") as {
    from: number;
    to: number;
    insert: string;
  };
  assert.deepEqual(change, { from: 13, to: 13, insert: "My note\n\tsecond" });
  const written = Text.of("a[^1]\n\n[^1]: My note\n\tsecond\n".split("\n"));
  assert.equal(definitionText(written, "1"), "My note\nsecond");
  assert.equal(definitionText(written, "2"), undefined);
});
