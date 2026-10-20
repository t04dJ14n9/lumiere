import assert from "node:assert/strict";
import test from "node:test";
import { markdownBlockEstimatedHeight } from "./markdown-block-height";

test("empty source still reserves one line of chrome", () => {
  assert.ok(markdownBlockEstimatedHeight("") > 20);
});

test("line count scales the reserve for tall callouts", () => {
  const small = markdownBlockEstimatedHeight("> [!note]\n> one\n");
  const lines = Array.from(
    { length: 40 },
    (_, i) => `> Callout body line ${i}`,
  );
  const large = markdownBlockEstimatedHeight(
    `> [!note] Tall\n${lines.join("\n")}`,
  );
  assert.ok(small > 40);
  assert.ok(large > small * 5);
  assert.ok(large > 800, `got ${large}`);
});

test("short Mermaid fences reserve tall SVG height, not bare line count", () => {
  const source = [
    "```mermaid",
    "flowchart TB",
    "  A[Start] --> B[Step]",
    "  B --> C[End]",
    "```",
  ].join("\n");
  const plain = markdownBlockEstimatedHeight("> [!note]\n> one\n> two\n> three\n");
  const mermaid = markdownBlockEstimatedHeight(source);
  assert.ok(mermaid >= 320, `got ${mermaid}`);
  assert.ok(
    mermaid > plain,
    `mermaid=${mermaid} should exceed same-ish line callout=${plain}`,
  );
});
