import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { prepareFootnotes } from "./preprocess";

test("rendered-block footnotes resolve definitions and inline numbering in the owning note", () => {
  const line = "Text [^n] and ^[inline].";
  const document = Text.of(["# Heading", line, "", "[^n]: named"]);
  const result = prepareFootnotes(line, document, 1, "nonce");
  assert.equal(
    result.displaySource,
    'Text <sup data-mw-footnote="fn-nonce-0"></sup> and <sup data-mw-footnote="fn-nonce-1"></sup>.',
  );
  assert.deepEqual(
    result.replacements.map(({ note }) => [note.text, note.number]),
    [
      ["named", 1],
      ["inline", 2],
    ],
  );
  assert.equal(
    result.replacements[1]!.note.from,
    document.line(2).from + line.indexOf("^["),
  );
});

test("footnote preprocessing leaves missing references intact and reuses repeated definitions", () => {
  const source = "[^missing] [^a] [^a]";
  const document = Text.of([source, "", "[^a]: definition"]);
  const result = prepareFootnotes(source, document, 0, "test");
  assert.ok(result.displaySource.startsWith("[^missing] "));
  assert.equal(result.replacements.length, 2);
  assert.equal(result.replacements[0]!.note, result.replacements[1]!.note);
  assert.deepEqual(
    result.replacements.map((item) => item.id),
    ["fn-test-0", "fn-test-1"],
  );
});
