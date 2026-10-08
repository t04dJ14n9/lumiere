import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import {
  footnotes,
  fragmentWithFootnotes,
} from "../../../src/markdown/metadata/footnotes";
import { noteFragment } from "../../../src/markdown/metadata/fragments";

test("footnotes number references in reading order and retain exact source positions", () => {
  const source =
    "Second[^b], first[^a], again[^b].\n\n[^a]: Alpha\n[^b]: **Beta**\n    continued\n\n    another paragraph";
  const notes = footnotes(Text.of(source.split("\n")));
  assert.deepEqual(
    notes.definitions.map((note) => [note.label, note.number, note.text]),
    [
      ["a", 2, "Alpha"],
      ["b", 1, "**Beta**\ncontinued\n\nanother paragraph"],
    ],
  );
  assert.deepEqual(notes.definitions[1]!.references, [
    source.indexOf("[^b]"),
    source.indexOf("[^b]", source.indexOf("[^b]") + 1),
  ]);
  for (const note of notes.definitions) {
    assert.ok(source.slice(note.from, note.to).startsWith(`[^${note.label}]:`));
  }
});

test("code, escaped references and frontmatter do not become footnotes", () => {
  const source =
    '---\nvalue: "[^a]"\n---\n\n`[^a]` \\[^a] and real[^a].\n\n```md\n[^fake]: code\n```\n\n[^a]: Real';
  const notes = footnotes(Text.of(source.split("\n")));
  assert.equal(notes.definitions.length, 1);
  assert.deepEqual(notes.definitions[0]!.references, [
    source.indexOf("real[^a]") + 4,
  ]);
});

test("inline footnotes share numbering and preserve nested brackets and code", () => {
  const source =
    "Inline^[**bold** [link](https://example.com) and `]`], named[^a], again[^a], last^[escaped \\] end].\n\n[^a]: Named\n  continued";
  const notes = footnotes(Text.of(source.split("\n")));
  assert.deepEqual(
    [...notes.references.values()].map((note) => note.number),
    [1, 2, 2, 3],
  );
  assert.equal(
    notes.references.get(source.indexOf("^["))!.text,
    "**bold** [link](https://example.com) and `]`",
  );
  assert.equal(notes.definitions[0]!.text, "Named\ncontinued");
});

test("escaped, code and unclosed inline notes remain literal", () => {
  const notes = footnotes(
    Text.of(["Escaped \\^[literal], `^[code]`, ^[unclosed"]),
  );
  assert.equal(notes.references.size, 0);
});

test("references inside definition bodies map through removed indentation", () => {
  const source =
    "Start[^a].\n\n[^a]: See[^b]\n  and again[^b].\n\n[^b]: Target";
  const notes = footnotes(Text.of(source.split("\n")));
  assert.deepEqual(notes.definitions[1]!.references, [
    source.indexOf("See[^b]") + 3,
    source.indexOf("again[^b]") + 5,
  ]);
  assert.equal(notes.definitions[1]!.number, 2);
  assert.equal(notes.references.size, 3);
});

test("section fragments include only needed definitions and terminate cyclic dependencies", () => {
  const source =
    "# Note\n\n## Selected\n\nReference[^a].\n\n## Outside\n\nUnrelated prose.\n\n[^a]: Depends on[^b]\n  continuation\n[^b]: Cycle[^a]\n[^unused]: Unrelated definition";
  const result = fragmentWithFootnotes(
    source,
    noteFragment(source, "Selected")!,
  );
  assert.ok(result.includes("[^a]: Depends on[^b]\n    continuation"));
  assert.ok(result.includes("[^b]: Cycle[^a]"));
  assert.ok(!result.includes("Unrelated"));
  assert.equal(result.split("[^a]:").length, 2);
  assert.equal(
    fragmentWithFootnotes(source, noteFragment(source, "")!),
    source,
  );
});

test("multiline inline notes omit surrounding quote and list markers from their body", () => {
  for (const source of [
    "> [!note] Note\n> Before^[first\n> second] after",
    "- Before^[first\n  second] after",
  ]) {
    const note = [
      ...footnotes(Text.of(source.split("\n"))).references.values(),
    ][0]!;
    assert.equal(note.text, "first\nsecond");
    assert.ok(source.slice(note.from, note.to).startsWith("^[first\n"));
  }
});

test("comment markers inside inline code do not hide later footnotes", () => {
  const source =
    "A percentage literal is `100%%` in inline code.\n\nEvidence[^real].\n\n[^real]: The rendered footnote remains visible.";
  const notes = footnotes(Text.of(source.split("\n")));
  assert.equal(
    notes.definitions[0]?.text,
    "The rendered footnote remains visible.",
  );
  assert.deepEqual(notes.definitions[0]?.references, [
    source.indexOf("[^real]"),
  ]);
});
