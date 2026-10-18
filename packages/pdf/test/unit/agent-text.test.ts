import assert from "node:assert/strict";
import { test } from "node:test";
import { agentText } from "../../src/shared/agent-text";

const source = { path: "papers/attention_v2.pdf", sha256: "ab".repeat(32) };

test("a text selection copies a short Markdown link and a blockquote", () => {
  const text = agentText(
    {
      kind: "text",
      text: "Scaled dot-product attention",
      pages: [
        {
          page: 3,
          rects: [
            [72, 83, 150, 95],
            [72, 95, 206, 104],
          ],
        },
      ],
    },
    source,
  );
  assert.equal(
    text,
    [
      "[attention_v2.pdf · p.3](papers/attention_v2.pdf#page=3&viewrect=72,83,134,21)",
      "",
      "> Scaled dot-product attention",
    ].join("\n"),
  );
});

test("a selection across pages links the first page and quotes all text", () => {
  const text = agentText(
    {
      kind: "text",
      text: "end of one page\nand start of the next",
      pages: [
        { page: 4, rects: [[72, 350, 200, 362]] },
        { page: 5, rects: [[72, 40, 180, 52]] },
      ],
    },
    source,
  );
  assert.equal(
    text,
    [
      "[attention_v2.pdf · p.4](papers/attention_v2.pdf#page=4&viewrect=72,350,128,12)",
      "",
      "> end of one page",
      "> and start of the next",
    ].join("\n"),
  );
});

test("a region copies its box link and quotes text found inside", () => {
  const text = agentText(
    {
      kind: "region",
      page: 7,
      rect: [150, 200, 250, 300],
      text: "figure caption",
    },
    source,
  );
  assert.equal(
    text,
    [
      "[attention_v2.pdf · p.7](papers/attention_v2.pdf#page=7&viewrect=150,200,100,100)",
      "",
      "> figure caption",
    ].join("\n"),
  );
});

test("a region with no text is just the link", () => {
  const text = agentText(
    { kind: "region", page: 9, rect: [92, 126, 520, 387] },
    source,
  );
  assert.equal(
    text,
    "[attention_v2.pdf · p.9](papers/attention_v2.pdf#page=9&viewrect=92,126,428,261)",
  );
});

test("the link label uses the basename and drops SHA, Source, and cite lines", () => {
  const text = agentText(
    {
      kind: "text",
      text: "hello",
      pages: [{ page: 1, rects: [[10, 20, 30, 40]] }],
    },
    { path: "docs/nested/main.pdf", sha256: "deadbeef" },
  );
  assert.match(text, /^\[main\.pdf · p\.1\]\(docs\/nested\/main\.pdf#page=1/);
  assert.doesNotMatch(text, /Source:|SHA-256|When you answer|Selected text:/u);
});

test("huge selected text is truncated in the blockquote", () => {
  const huge = "a".repeat(12_000);
  const text = agentText(
    {
      kind: "text",
      text: huge,
      pages: [{ page: 2, rects: [[1, 2, 3, 4]] }],
    },
    source,
  );
  const quoted = text.split("\n\n")[1]!;
  assert.ok(quoted.startsWith("> "));
  assert.ok(quoted.endsWith("…"));
  assert.ok(quoted.length < huge.length);
});
