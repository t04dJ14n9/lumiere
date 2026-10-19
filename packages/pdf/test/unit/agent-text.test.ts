import assert from "node:assert/strict";
import { test } from "node:test";
import { agentText } from "../../src/shared/agent-text";

const source = { path: "papers/attention_v2.pdf" };

test("a text selection copies basename · p.N link and a blockquote", () => {
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
  assert.doesNotMatch(text, /Source:|SHA-256|cite|\\_/u);
});

test("a selection across pages lists one link per page", () => {
  const text = agentText(
    {
      kind: "text",
      text: "end of one page and start of the next",
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
      "[attention_v2.pdf · p.5](papers/attention_v2.pdf#page=5&viewrect=72,40,108,12)",
      "",
      "> end of one page and start of the next",
    ].join("\n"),
  );
});

test("a region copies its box link without region prose or image path", () => {
  const text = agentText(
    { kind: "region", page: 7, rect: [150, 200, 250, 300] },
    source,
  );
  assert.equal(
    text,
    "[attention_v2.pdf · p.7](papers/attention_v2.pdf#page=7&viewrect=150,200,100,100)",
  );
  assert.doesNotMatch(text, /Selected PDF region|Region image/u);
});

test("a region with text quotes it; image paths are not on the clipboard", () => {
  const text = agentText(
    {
      kind: "region",
      page: 9,
      rect: [92, 126, 520, 387],
      text: "N d_model\nbase 6 512",
    },
    source,
  );
  assert.equal(
    text,
    [
      "[attention_v2.pdf · p.9](papers/attention_v2.pdf#page=9&viewrect=92,126,428,261)",
      "",
      "> N d_model",
      "> base 6 512",
    ].join("\n"),
  );
  assert.doesNotMatch(text, /Region image|SHA-256|Source:/u);
});
