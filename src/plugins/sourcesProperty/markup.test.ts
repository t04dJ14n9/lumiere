import test from "node:test";
import assert from "node:assert/strict";
import { renderSources } from "./markup";
import { planSourceOpen } from "./open";

test("sources markup is stacked, read-only, and keeps every row", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    resource: `https://example.com/${index}`,
    title: `Source ${index}`,
  }));
  const html = renderSources(entries, {});
  assert.match(html, /Showing 8 of 9/);
  assert.match(html, /data-source-extra/);
  assert.equal(html.match(/data-source-index=/g)?.length, 9);
  assert.doesNotMatch(html, /contenteditable|Add source|data-property-list/);
});

test("navigation stays on the owning document and rejects unsafe targets", () => {
  const text = `---\nsources:\n  - resource: https://example.com/a\n---\n`;
  assert.equal(
    planSourceOpen({
      resource: "https://example.com/a",
      text,
      documentPath: "bundle/note.md",
      bundleRoot: "bundle",
      live: true,
    }).action,
    "external",
  );
  assert.equal(
    planSourceOpen({
      resource: "javascript:alert(1)",
      text: "---\nsources:\n  - resource: javascript:alert(1)\n---\n",
      documentPath: "bundle/note.md",
      bundleRoot: "bundle",
      live: true,
    }).action,
    "refuse",
  );
  assert.equal(
    planSourceOpen({
      resource: "https://example.com/a",
      text,
      documentPath: "bundle/note.md",
      bundleRoot: "bundle",
      live: false,
    }).reason,
    "okf is off",
  );
  assert.equal(
    planSourceOpen({
      resource: "https://example.com/missing",
      text,
      documentPath: "bundle/note.md",
      live: true,
    }).reason,
    "stale source",
  );
});
