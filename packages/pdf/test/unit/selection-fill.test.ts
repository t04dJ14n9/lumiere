import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** The value of `--selection-fill` in the viewer's stylesheet. */
function selectionFill(): string {
  const css = readFileSync(
    new URL("../../src/webview/styles/base.css", import.meta.url),
    "utf8",
  );
  const value = /--selection-fill:([^;]+);/u.exec(css)?.[1];
  assert.ok(value, "base.css defines --selection-fill");
  return value
    .replace(/\s+/gu, " ")
    .replace(/\( /gu, "(")
    .replace(/ \)/gu, ")")
    .trim();
}

test("the text selection is painted solid, so overlapping line boxes do not darken twice", () => {
  // EmbedPDF draws one box per line and multiplies them onto the page as a
  // group; tight lines and larger words make neighbouring boxes overlap.
  // The theme's colour is made solid first: some themes' are see-through.
  const fill = selectionFill();
  assert.match(fill, /^color-mix\(in srgb, oklch\(.+ \/ 1\) 40%, white\)$/u);
});
