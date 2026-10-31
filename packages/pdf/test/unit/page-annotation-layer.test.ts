import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pagePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/webview/page.tsx",
);

test("Page mounts AnnotationLayer before SelectionLayer", () => {
  const source = readFileSync(pagePath, "utf8");
  assert.match(source, /AnnotationLayer/);
  const ann = source.indexOf("<AnnotationLayer");
  const sel = source.indexOf("<SelectionLayer");
  assert.ok(
    ann > 0 && sel > ann,
    "AnnotationLayer must precede SelectionLayer in JSX",
  );
});

test("AnnotationLayer hit-tests only in Annotate mode", () => {
  const source = readFileSync(pagePath, "utf8");
  assert.match(source, /annotate:\s*boolean/);
  const block = source.slice(
    source.indexOf("<AnnotationLayer"),
    source.indexOf("/>", source.indexOf("<AnnotationLayer")) + 2,
  );
  assert.match(block, /position:\s*"absolute"/);
  assert.match(
    block,
    /pointerEvents:\s*annotate\s*\?\s*"auto"\s*:\s*"none"/,
  );
});
