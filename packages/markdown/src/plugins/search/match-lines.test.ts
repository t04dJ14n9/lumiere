import assert from "node:assert/strict";
import test from "node:test";
import { parseSearch } from "../../markdown/search/query";
import { contentNeedles, extractMatchLines } from "./match-lines";

test("contentNeedles skips file/path/tag/property and not", () => {
  assert.deepEqual(contentNeedles(parseSearch("path:notes")), []);
  assert.deepEqual(contentNeedles(parseSearch("file:Alice")), []);
  assert.deepEqual(contentNeedles(parseSearch("tag:#x")), []);
  assert.deepEqual(contentNeedles(parseSearch("[status:done]")), []);
  assert.deepEqual(contentNeedles(parseSearch("-meeting")), []);
  assert.equal(contentNeedles(parseSearch("meeting")).length, 1);
  assert.equal(contentNeedles(parseSearch("content:meeting")).length, 1);
  assert.equal(contentNeedles(parseSearch("line:(foo OR bar)")).length, 2);
});

test("match-case scopes flip needle sensitivity", () => {
  const sensitive = contentNeedles(parseSearch("match-case:Foo"));
  assert.equal(sensitive[0]?.kind, "text");
  if (sensitive[0]?.kind === "text") {
    assert.equal(sensitive[0].sensitive, true);
  }
  const insensitive = contentNeedles(parseSearch("ignore-case:Foo"));
  if (insensitive[0]?.kind === "text") {
    assert.equal(insensitive[0].sensitive, false);
  }
});

test("extractMatchLines finds and marks matching lines", () => {
  const text = ["alpha", "hello Meeting world", "beta Meeting", "gamma"].join(
    "\n",
  );
  const matches = extractMatchLines(text, "meeting");
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.text, "hello Meeting world");
  assert.equal(matches[0]?.offset, "alpha\n".length);
  assert.deepEqual(matches[0]?.mark, { from: 6, to: 13 });
  assert.equal(matches[1]?.text, "beta Meeting");
});

test("extractMatchLines truncates long lines around the hit", () => {
  const prefix = "x".repeat(180);
  const suffix = "y".repeat(180);
  const line = `${prefix}FINDME${suffix}`;
  const matches = extractMatchLines(line, "FINDME");
  assert.equal(matches.length, 1);
  assert.ok((matches[0]?.text.length ?? 0) <= 202);
  assert.ok(matches[0]?.text.includes("FINDME"));
  assert.ok(matches[0]?.text.startsWith("…"));
  assert.ok(matches[0]?.text.endsWith("…"));
  assert.equal(
    matches[0]?.mark &&
      matches[0].text.slice(matches[0].mark.from, matches[0].mark.to),
    "FINDME",
  );
});

test("extractMatchLines caps at 25 and ignores path-only queries", () => {
  const lines = Array.from({ length: 40 }, (_, i) => `hit ${i} needle`);
  const matches = extractMatchLines(lines.join("\n"), "needle");
  assert.equal(matches.length, 25);
  assert.deepEqual(extractMatchLines("needle here", "path:notes"), []);
});

test("regex needles respect flags and case", () => {
  const matches = extractMatchLines("Alpha\nbeta", "/al+/i");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.text, "Alpha");
});
