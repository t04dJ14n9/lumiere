import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FENCED_PREVIEW } from "../../webview/ui/markdown-widget";
import { diagramLanguage } from "./webview";

test("diagrams claim only the Mermaid fence language", () => {
  assert.equal(diagramLanguage(" mermaid title"), true);
  assert.equal(diagramLanguage("MERMAID"), true);
  assert.equal(diagramLanguage("mermaid-extra"), false);
  assert.equal(diagramLanguage("javascript"), false);
});

test("rendered fences reveal only from the Edit button, selecting the code", () => {
  assert.equal(FENCED_PREVIEW.reveal, "button");
  assert.equal(FENCED_PREVIEW.guardMargin, true);
  const source = "```mermaid\nflowchart LR\nA --> B\n```";
  const span = FENCED_PREVIEW.select!(source);
  assert.equal(source.slice(span.from, span.to), "flowchart LR\nA --> B");
});

test("an empty or unclosed fence still gives the code a place", () => {
  const body = (source: string) => {
    const span = FENCED_PREVIEW.select!(source);
    return [span.from, span.to];
  };
  // Empty: the end of the opening line.
  assert.deepEqual(body("```mermaid\n```"), [10, 10]);
  // Unclosed: the code runs to the end.
  assert.deepEqual(body("```mermaid\nA --> B"), [11, 18]);
  assert.deepEqual(body("~~~mermaid\nA\n~~~"), [11, 12]);
});

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "diagrams.css"),
  "utf8",
);

test("mermaid SVG is not shrink-to-fit with max-width 100%", () => {
  const svgRule = css.match(/pre\[data-fence="mermaid"\] svg\s*\{[^}]*\}/)?.[0];
  assert.ok(svgRule, "expected svg rule");
  assert.equal(/\bmax-width\s*:\s*100%/.test(svgRule), false);
});

test("mermaid fence keeps overflow-x auto", () => {
  const host = css.match(
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(host);
  assert.match(host, /overflow-x\s*:\s*auto/);
});

test("wide mermaid scrolls inside the column instead of widening the note", () => {
  const host = css.match(
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(host);
  // Stops the SVG min-content width from becoming the note's flex min-width.
  assert.match(host, /contain\s*:\s*inline-size/);
  assert.match(host, /max-width\s*:\s*100%/);
  assert.match(host, /overflow-y\s*:\s*hidden/);
});

test("dark Mermaid SVG uses Obsidian invert filter", () => {
  assert.match(
    css,
    /body:not\(\.vscode-light\):not\(\.vscode-high-contrast-light\)[\s\S]*?pre\[data-fence="mermaid"\][\s\S]*?>\s*svg[\s\S]*?filter:\s*invert\(100%\)\s+hue-rotate\(180deg\)\s+saturate\(1\.25\)/,
  );
});

test("diagram inspector Mermaid SVG uses the same dark invert", () => {
  assert.match(
    css,
    /body:not\(\.vscode-light\):not\(\.vscode-high-contrast-light\)[\s\S]*?\.diagram-inspector[\s\S]*?svg[\s\S]*?filter:\s*invert\(100%\)\s+hue-rotate\(180deg\)\s+saturate\(1\.25\)/,
  );
});

test("markdown webview defines --font-mermaid from the note text font", () => {
  const base = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../webview/styles/base.css",
    ),
    "utf8",
  );
  assert.match(base, /--font-mermaid:\s*var\(--text-font\)/);
});
