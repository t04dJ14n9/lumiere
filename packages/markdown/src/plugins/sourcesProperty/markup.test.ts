import test from "node:test";
import assert from "node:assert/strict";
import { renderSources } from "./markup";
import {
  planSourceOpen,
  supportedFragmentOffset,
  viewerFragment,
} from "./open";

test("sources markup is stacked, keeps every row, and has no Copy id", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    resource: `https://example.com/${index}`,
    title: `Source ${index}`,
  }));
  const html = renderSources(entries, {});
  assert.match(html, /Showing 8 of 9/);
  assert.match(html, /data-source-extra/);
  assert.equal(html.match(/data-source-index=/g)?.length, 9);
  assert.doesNotMatch(html, /contenteditable|Add source|data-property-list/);
  assert.doesNotMatch(html, /Copy id|data-source-copy/);
});

test("expanded sources show every row without a disclosure button", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    resource: `https://example.com/${index}`,
    title: `Source ${index}`,
  }));
  const html = renderSources(entries, {}, { expanded: true });
  assert.doesNotMatch(html, /Showing |data-source-more|data-source-extra| hidden/);
  assert.equal(html.match(/data-source-index=/g)?.length, 9);
});

test("sources id is plain selectable text without a copy control", () => {
  const html = renderSources(
    [{ resource: "https://example.com/a", id: "src-1", title: "One" }],
    {},
  );
  assert.match(html, /class="source-id">src-1</);
  assert.doesNotMatch(html, /Copy id|data-source-copy|button[^>]*source-id/);
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
  assert.deepEqual(
    planSourceOpen({
      resource: "../raw/paper.pdf",
      text: "---\nsources:\n  - resource: ../raw/paper.pdf\n---\n",
      documentPath: "bundle/concept/topic.md",
      bundleRoot: "bundle",
      live: true,
    }),
    { action: "workspace", path: "bundle/raw/paper.pdf" },
  );
  const headed = "# Details\n\nbody\n";
  const note = planSourceOpen({
    resource: "../notes/topic.md#Details",
    text: "---\nsources:\n  - resource: ../notes/topic.md#Details\n---\n",
    documentPath: "bundle/concept/topic.md",
    bundleRoot: "bundle",
    live: true,
  });
  assert.equal(note.path, "bundle/notes/topic.md");
  assert.equal(note.fragment, "#Details");
  assert.equal(supportedFragmentOffset(headed, note.fragment), 0);
  assert.equal(supportedFragmentOffset(headed, "#page=3"), undefined);
  assert.equal(viewerFragment("#page=3"), "page=3");
  assert.equal(viewerFragment("#viewrect=0,0,100,100"), "viewrect=0,0,100,100");
  assert.equal(viewerFragment("#Details"), undefined);
  assert.deepEqual(
    planSourceOpen({
      resource: "/raw/paper.pdf#page=3",
      text: "---\nsources:\n  - resource: /raw/paper.pdf#page=3\n---\n",
      documentPath: "bundle/concept/topic.md",
      bundleRoot: "bundle",
      live: true,
    }),
    {
      action: "workspace",
      path: "bundle/raw/paper.pdf",
      fragment: "#page=3",
    },
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
