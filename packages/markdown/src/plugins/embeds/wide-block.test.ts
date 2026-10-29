import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "embeds.css"),
  "utf8",
);

test("Live Preview image-embed allows overflow-x for wide images", () => {
  // After change: a dedicated LP rule or updated .image-embed includes overflow-x: auto
  assert.match(css, /\.image-embed[^{]*\{[^}]*overflow-x\s*:\s*auto/s);
});

test("Live Preview image-embed does not clamp with max-width 100%", () => {
  // Strip lightbox .image-inspector rules before asserting LP host
  const withoutInspector = css.replace(
    /\.image-inspector[\s\S]*?(?=\n\/\*|\n\.file-embed|\n\.pdf-embed|$)/,
    "",
  );
  // Prefer: no max-width:100% on .image-embed { ... } blocks used in LP
  const hosts = [
    ...withoutInspector.matchAll(/\.image-embed\s*\{[^}]*\}/g),
  ].map((m) => m[0]);
  assert.ok(hosts.length >= 1);
  for (const rule of hosts) {
    assert.equal(/\bmax-width\s*:\s*100%/.test(rule), false, rule);
  }
});

test("Live Preview image-embed is pane-constrained so overflow-x can scroll", () => {
  // Mirror .table-scroll: contain:inline-size (or width:100%) keeps the host
  // within the pane so overflow-x engages instead of growing the note.
  const withoutInspector = css.replace(
    /\.image-inspector[\s\S]*?(?=\n\/\*|\n\.file-embed|\n\.pdf-embed|$)/,
    "",
  );
  const hosts = [
    ...withoutInspector.matchAll(/\.image-embed\s*\{[^}]*\}/g),
  ].map((m) => m[0]);
  assert.ok(hosts.length >= 1);
  for (const rule of hosts) {
    const constrained =
      /contain\s*:\s*inline-size/.test(rule) || /width\s*:\s*100%/.test(rule);
    assert.equal(constrained, true, rule);
  }
});
