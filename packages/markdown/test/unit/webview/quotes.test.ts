import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markdownCss = readFileSync(
  new URL("../../../src/webview/styles/markdown.css", import.meta.url),
  "utf8",
);

/** The declarations of a rule, by its exact selector. */
function rule(selector: string): string {
  const start = markdownCss.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return markdownCss.slice(start, markdownCss.indexOf("}", start));
}

test("quote text keeps the normal text colour, as in Obsidian, in source and rendered", () => {
  for (const selector of [
    "#app .cm-line.md-quote",
    ".markdown-rendered blockquote",
  ]) {
    assert.doesNotMatch(
      rule(selector),
      /\bcolor:/,
      `${selector} recolours text`,
    );
  }
});
