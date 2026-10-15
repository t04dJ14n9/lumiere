import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRenderer } from "../../../src/markdown/html";

const markdownCss = readFileSync(
  new URL("../../../src/webview/styles/markdown.css", import.meta.url),
  "utf8",
);
const linksCss = readFileSync(
  new URL("../../../src/plugins/links/links.css", import.meta.url),
  "utf8",
);

/** The declarations of a rule, by its exact selector. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
}

test("links use a continuous border-bottom underline, not text-decoration", () => {
  // Combined selector ".md-link,\n.markdown-rendered a" — look up by first line.
  const start = markdownCss.indexOf(".md-link,");
  assert.ok(start >= 0, ".md-link rule present");
  const block = markdownCss.slice(start, markdownCss.indexOf("}", start));
  assert.match(block, /border-bottom:\s*1px\s+solid/);
  assert.match(block, /text-decoration:\s*none/);
  assert.doesNotMatch(block, /text-decoration:\s*underline/);

  const hoverStart = markdownCss.indexOf(".md-link:hover,");
  assert.ok(hoverStart >= 0, ".md-link:hover rule present");
  const hover = markdownCss.slice(
    hoverStart,
    markdownCss.indexOf("}", hoverStart),
  );
  assert.match(hover, /border-bottom-color:\s*currentColor/);
});

test("linked code chips keep their look without painting over the underline", () => {
  const block = rule(
    markdownCss,
    ".md-inline-code,\n.markdown-rendered :not(pre) > code",
  );
  assert.match(block, /padding:\s*0\.1em\s+0\.25em/);
  assert.match(block, /border-radius:\s*4px/);
  assert.match(block, /background:\s*var\(--code\)/);

  // The opaque chip must not extend vertically over the link's border.
  // Include nested formatting in rendered links, such as <a><em><code>.
  const linkedCode = rule(
    markdownCss,
    ".md-link .md-inline-code,\n.markdown-rendered a > code,\n.markdown-rendered a :not(pre) > code",
  );
  assert.match(linkedCode, /padding-block:\s*0\s*;/);
  assert.doesNotMatch(linkedCode, /padding(?:-inline(?:-start|-end)?)?:/);
});

test("rendered links with a direct code child and trailing text zero the chip's vertical padding", () => {
  const html = createRenderer().renderMarkdown(
    "[`code` text](https://example.com)",
  );
  assert.match(html, /<a\b[^>]*><code>code<\/code> text<\/a>/);

  // A descendant before :not(pre) requires an intermediate element and misses
  // this renderer output, so the direct-child selector must share the override.
  const linkedCode = rule(
    markdownCss,
    ".markdown-rendered a > code,\n.markdown-rendered a :not(pre) > code",
  );
  assert.match(linkedCode, /padding-block:\s*0\s*;/);
});

test("unresolved links keep a dotted underline via border-bottom-style", () => {
  const block = rule(
    linksCss,
    ".md-link-rendered.is-unresolved,\n.markdown-rendered a.is-unresolved",
  );
  assert.match(block, /border-bottom-style:\s*dotted/);
  assert.doesNotMatch(block, /text-decoration-style/);
});
