import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const embedsCss = readFileSync(
  new URL("../../../src/plugins/embeds/embeds.css", import.meta.url),
  "utf8",
);

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
}

test("image embeds get Obsidian embed-actions frosted chrome with VS Code tokens", () => {
  const host = rule(embedsCss, ".image-embed");
  assert.match(host, /position:\s*relative/);

  const actions = rule(embedsCss, ".image-embed .embed-actions");
  assert.match(actions, /position:\s*absolute/);
  assert.match(actions, /inset-inline-end:\s*8px/);
  assert.match(actions, /opacity:\s*0/);
  assert.match(actions, /backdrop-filter:\s*blur/);
  assert.match(actions, /box-shadow:/);
  assert.match(actions, /var\(--vscode-editor-background/);

  const action = rule(embedsCss, ".image-embed .embed-action");
  assert.match(action, /var\(--vscode-editor-foreground/);

  const selected = rule(
    embedsCss,
    ".image-embed:has(img.md-image-selected) .embed-actions,\n.image-embed .embed-action:focus-visible,\n.markdown-rendered .image-embed:hover .embed-actions",
  );
  assert.match(selected, /opacity:\s*1/);

  // Legacy floating inspect opacity rules are gone — chrome owns visibility.
  assert.doesNotMatch(
    embedsCss,
    /\.file-embed:hover \.inspect-image/,
  );
});
