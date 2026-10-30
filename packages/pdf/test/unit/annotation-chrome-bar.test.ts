import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("chrome Annotate mode reserves a grid row for the toolkit strip", () => {
  const css = readFileSync(
    join(root, "src/webview/styles/base.css"),
    "utf8",
  );
  assert.match(css, /\.viewer\.tool-annotate:not\(\.toolbar-slim\)/);
  assert.match(
    css,
    /tool-annotate:not\(\.toolbar-slim\)[^{]*\{[\s\S]*?auto minmax\(0, 1fr\)/,
  );
});

test("Viewer mounts AnnotationChromeBar when tool is annotate and mode is not slim", () => {
  const source = readFileSync(join(root, "src/webview/viewer.tsx"), "utf8");
  assert.match(source, /AnnotationChromeBar/);
  assert.match(
    source,
    /tool === "annotate" && toolbar\.mode !== "slim"/,
  );
});
