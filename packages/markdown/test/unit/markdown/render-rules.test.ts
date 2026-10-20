import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../../../src/markdown/html";
const { renderMarkdown } = createRenderer();

test("callout aliases, fallback kinds and fold flags preserve distinct containers", () => {
  const result = renderMarkdown(
    "> [!tldr]+ Summary\n> Body\n\n> [!unknown]-\n> Other",
  );
  assert.match(
    result,
    /<details class="callout" data-callout="abstract" open>/,
  );
  assert.match(
    result,
    /<summary class="callout-title"><span class="callout-title-text">Summary<\/span><button type="button" class="callout-fold" aria-label="Toggle callout">›<\/button><\/summary>/,
  );
  assert.match(result, /<details class="callout" data-callout="note">/);
  assert.match(
    result,
    /<summary class="callout-title"><span class="callout-title-text">Unknown<\/span><button type="button" class="callout-fold" aria-label="Toggle callout">›<\/button><\/summary>/,
  );
  assert.equal((result.match(/<\/details>/g) ?? []).length, 2);
});

test("an untitled callout of a hyphenated type reads as words, as in Obsidian", () => {
  assert.match(
    renderMarkdown("> [!unknown-type]\n> Body"),
    /class="callout-title"><span class="callout-title-text">Unknown type<\/span><\/div>/,
  );
});

test("math delimiters and paragraph block IDs retain literal boundary behavior", () => {
  assert.match(
    renderMarkdown("$$\na + b\n$$"),
    /data-math="a%20%2B%20b" data-display="true"/,
  );
  assert.doesNotMatch(renderMarkdown("$ spaced $"), /math-placeholder/);
  assert.doesNotMatch(renderMarkdown("$$ unclosed"), /math-placeholder/);
  assert.match(
    renderMarkdown("Paragraph ^known-id"),
    /<p id="block-known-id">Paragraph<\/p>/,
  );
  assert.equal(renderMarkdown("^standalone").trim(), "");
});
