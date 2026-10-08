import test from "node:test";
import assert from "node:assert/strict";
import { rewriteLinks } from "../../../src/plugins/linkUpdates/rewrite";
import type { RewriteContext } from "../../../src/plugins/linkUpdates/rewrite";
import { memoryVaults } from "../views/fakes";

/** Apply edits (line/col) to text, last first. */
function apply(text: string, edits: ReturnType<typeof rewriteLinks>): string {
  const lines = text.split("\n");
  const offset = (point: { line: number; col: number }) =>
    lines.slice(0, point.line).reduce((sum, line) => sum + line.length + 1, 0) +
    point.col;
  return [...edits]
    .sort((a, b) => offset(b.start) - offset(a.start))
    .reduce(
      (result, edit) =>
        result.slice(0, offset(edit.start)) +
        edit.text +
        result.slice(offset(edit.end)),
      text,
    );
}

function context(
  notes: Record<string, string>,
  renames: Record<string, string>,
  format: RewriteContext["format"] = "shortest",
): RewriteContext {
  const { index } = memoryVaults(notes);
  const map = new Map(Object.entries(renames));
  return {
    renames: map,
    resolve: (linkpath, source) => index.resolveLink(linkpath, source)?.path,
    pathsAfter: index.files().map((file) => map.get(file.path) ?? file.path),
    format,
  };
}

const vault = {
  "Old.md": "",
  "Other.md": "",
  "pic.png": "",
  "sub/Deep.md": "",
};

test("links to a renamed note keep their form, subpath and alias", () => {
  const text = [
    "---",
    'up: "[[Old]]"',
    "---",
    "[[Old]] [[Old#Part|shown]] ![[Old#^block]] [x](Old.md#Part) [[Other]]",
  ].join("\n");
  const ctx = context({ ...vault, "A.md": text }, { "Old.md": "New Name.md" });
  assert.equal(
    apply(text, rewriteLinks(text, "A.md", ctx)),
    [
      "---",
      'up: "[[New Name]]"',
      "---",
      "[[New Name]] [[New Name#Part|shown]] ![[New Name#^block]] [x](New%20Name.md#Part) [[Other]]",
    ].join("\n"),
  );
});

test("an attachment keeps its extension; formats follow the setting", () => {
  const text = "![[pic.png]] [[Old]]";
  const renames = { "pic.png": "assets/photo.png", "Old.md": "sub/Moved.md" };
  const notes = { ...vault, "A.md": text };
  assert.equal(
    apply(text, rewriteLinks(text, "A.md", context(notes, renames))),
    "![[photo.png]] [[Moved]]",
  );
  assert.equal(
    apply(
      text,
      rewriteLinks(text, "A.md", context(notes, renames, "absolute")),
    ),
    "![[assets/photo.png]] [[sub/Moved]]",
  );
  assert.equal(
    apply(
      text,
      rewriteLinks(
        text,
        "notes/A.md",
        context({ ...vault, "notes/A.md": text }, renames, "relative"),
      ),
    ),
    "![[../assets/photo.png]] [[../sub/Moved]]",
  );
});

test("a name that becomes ambiguous is written as a path", () => {
  const text = "[[Old]]";
  const ctx = context(
    { ...vault, "A.md": text },
    { "Old.md": "archive/Other.md" },
  );
  assert.equal(
    apply(text, rewriteLinks(text, "A.md", ctx)),
    "[[archive/Other]]",
  );
});

test("a moved note rewrites its own path-style links, not bare names", () => {
  const text = "[[./Other]] [[sub/Deep]] [[Other]]";
  const ctx = context(
    { ...vault, "A.md": text },
    { "A.md": "sub/A.md" },
    "relative",
  );
  assert.equal(
    apply(text, rewriteLinks(text, "A.md", ctx)),
    "[[../Other]] [[Deep]] [[Other]]",
  );
});

test("links that do not touch a renamed file are left alone", () => {
  const text = "[[Other]] [[Missing]] [web](https://example.com)";
  const ctx = context({ ...vault, "A.md": text }, { "Old.md": "New.md" });
  assert.deepEqual(rewriteLinks(text, "A.md", ctx), []);
});
