import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../../../", import.meta.url).pathname;
const base = readFileSync(
  path.join(root, "src/webview/styles/base.css"),
  "utf8",
)
  .replace(/\s+/g, " ")
  .replace(/\( /g, "(")
  .replace(/,? \)/g, ")");

test("the selection layer is drawn above line backgrounds and blended, not dimming text", () => {
  const layer =
    /#app \.cm-editor :is\(\.cm-selectionLayer, \.mw-selection-layer\) \{([^}]*)\}/.exec(
      base,
    );
  assert.ok(layer, "selection layer rule");
  assert.match(layer[1] ?? "", /z-index: 1 !important/);
  assert.match(layer[1] ?? "", /mix-blend-mode: screen/);
  assert.match(
    base,
    /body\.vscode-light #app \.cm-editor :is\(\.cm-selectionLayer, \.mw-selection-layer\),[^{]*\{\s*mix-blend-mode: multiply;/,
  );
});

test("the selection is a see-through accent tint: 33% on dark, 20% on light", () => {
  assert.match(
    base,
    /--selection-tint: color-mix\(in oklch, var\(--selection-accent\) 33%, transparent\)/,
  );
  assert.match(
    base,
    /--selection-tint: color-mix\(in oklch, var\(--selection-accent\) 20%, transparent\)/,
  );
  assert.match(
    base,
    /\.cm-focused \.cm-selectionBackground,[^{]*\{\s*background: var\(--selection-tint\);/,
  );
  assert.doesNotMatch(base, /selectionBackground[^{]*\{\s*[^}]*opacity/);
});
