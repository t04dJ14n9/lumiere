import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { parseMarkdown, markdownParser } from "../../../src/markdown/dialect";
import { footnoteDefinitions } from "../../../src/markdown/metadata/footnote-definitions";
import { collectFootnoteCandidates } from "../../../src/markdown/metadata/footnote-candidates";
import {
  definitionPosition,
  extractFootnotes,
} from "../../../src/markdown/metadata/footnote-extract";

test("definition segments map continuations across blank lines without borrowing following prose", () => {
  const source = "[^a]: first\n    second\n\n  third\nNext paragraph";
  const document = Text.of(source.split("\n"));
  const [note] = footnoteDefinitions(document, parseMarkdown(document));
  assert.equal(note!.text, "first\nsecond\n\nthird");
  for (const word of ["first", "second", "third"]) {
    assert.equal(
      definitionPosition(note!.segments, note!.text.indexOf(word)),
      source.indexOf(word),
    );
  }
  assert.equal(note!.to, source.indexOf("\nNext"));
  assert.equal(
    definitionPosition(note!.segments, note!.text.length + 1),
    undefined,
  );
});

test("candidate collection drops unmappable ranges and duplicate definitions retain last-label resolution", () => {
  const text = "First[^a] and ^[inline]";
  const candidates = collectFootnoteCandidates({
    text,
    syntax: markdownParser.parse(text),
    definitions: [],
    position: (at) => (at < text.indexOf("^[") ? at + 100 : undefined),
  });
  assert.deepEqual(candidates, [{ from: 105, to: 109, label: "a" }]);
  const source = "Reference[^a]\n\n[^a]: first\n[^a]: last";
  const registry = extractFootnotes(Text.of(source.split("\n")));
  assert.equal(registry.references.get(source.indexOf("[^a]"))!.text, "last");
  assert.equal(registry.definitions[0]!.number, undefined);
  assert.equal(registry.definitions[1]!.number, 1);
});
