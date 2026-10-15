import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("inline code chips keep horizontal padding for the gray chip look", () => {
  const block = rule(
    markdownCss,
    ".md-inline-code,\n.markdown-rendered :not(pre) > code",
  );
  assert.match(block, /padding:\s*0\.1em\s+0\.25em/);
});

test("unresolved links keep a dotted underline via border-bottom-style", () => {
  const block = rule(
    linksCss,
    ".md-link-rendered.is-unresolved,\n.markdown-rendered a.is-unresolved",
  );
  assert.match(block, /border-bottom-style:\s*dotted/);
  assert.doesNotMatch(block, /text-decoration-style/);
});
