import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalActive } from "../../src/ide-context/canonical";

test("URI mismatch omits host caret/selection/language/dirty and warns", () => {
  const { active, warnings } = resolveCanonicalActive(
    { product: "pdfWorkshop", uri: "file:///doc.pdf" },
    {
      activeTextEditor: {
        uri: "file:///other.ts",
        languageId: "typescript",
        isDirty: true,
        caret: { line: 1, character: 0 },
        selection: {
          from: 0,
          to: 1,
          startLine: 1,
          endLine: 1,
          text: "x",
          truncated: false,
        },
      },
    },
  );
  assert.equal(active.uri, "file:///doc.pdf");
  assert.equal(active.languageId, undefined);
  assert.equal(active.caret, undefined);
  assert.ok(warnings.some((w) => /URI mismatch/i.test(w)));
});

test("matching host URI may augment language/caret", () => {
  const { active, warnings } = resolveCanonicalActive(
    { product: "markdownWorkshop", uri: "file:///note.md" },
    {
      activeTextEditor: {
        uri: "file:///note.md",
        languageId: "markdown",
        isDirty: true,
        caret: { line: 3, character: 2 },
      },
    },
  );
  assert.equal(active.languageId, "markdown");
  assert.equal(active.isDirty, true);
  assert.deepEqual(active.caret, { line: 3, character: 2 });
  assert.equal(warnings.length, 0);
});
