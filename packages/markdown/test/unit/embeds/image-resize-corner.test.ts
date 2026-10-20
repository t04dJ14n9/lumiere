import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const embedsCss = readFileSync(
  new URL("../../../src/plugins/embeds/embeds.css", import.meta.url),
  "utf8",
);

/** Declarations of a rule by exact selector start. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
}

test("selected images keep an outline and hosts get Obsidian resize-corner chrome", () => {
  const selected = rule(embedsCss, "img.md-image-selected");
  assert.match(selected, /outline:\s*2px\s+solid\s+var\(--accent\)/);

  const host = rule(embedsCss, ".image-embed");
  assert.match(host, /position:\s*relative/);
  assert.match(host, /width:\s*fit-content/);

  const corner = rule(embedsCss, ".image-embed .image-resize-corner");
  assert.match(corner, /width:\s*30px/);
  assert.match(corner, /height:\s*30px/);
  assert.match(corner, /cursor:\s*nwse-resize/);
  assert.match(corner, /pointer-events:\s*none/);
  assert.match(corner, /inset-inline-end:\s*0/);

  const chevron = rule(embedsCss, ".image-embed .image-resize-corner::after");
  assert.match(chevron, /width:\s*10px/);
  assert.match(chevron, /border-bottom:/);
  assert.match(chevron, /border-inline-end:/);
  assert.match(chevron, /var\(--vscode-descriptionForeground/);
  assert.match(chevron, /opacity:\s*0/);

  const shown = rule(
    embedsCss,
    ".image-embed:has(img.md-image-selected) .image-resize-corner::after",
  );
  assert.match(shown, /opacity:\s*1/);
  assert.match(shown, /var\(--vscode-focusBorder/);
});
