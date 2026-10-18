import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { insertFootnote } from "./edit";
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
