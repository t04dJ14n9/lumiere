import test from "node:test";
import assert from "node:assert/strict";
import {
  headingAt,
  headingLinkEdits,
  type RenamedHeading,
} from "../../../src/plugins/linkUpdates/heading-rename";
import { headingNameProblem } from "../../../src/plugins/linkUpdates/rename-heading";

// Expected notes are Obsidian's, measured with its Rename heading in a
// throwaway vault (2026-10-17).
const PROBE =
  "# Top\n\n## Old Name\n\ntext [[#Old Name]] and [x](#Old%20Name)\n\n### Sub\n\nbody";
const OTHER =
  "[[probe#Old Name]] [[probe#Old Name|alias]] [y](probe.md#Old%20Name) [[probe#Old Name#Sub]] [[probe#Top#Old Name]] [[probe#old name]] ![[probe#Old Name]]";

function apply(
  text: string,
  edits: { from: number; to: number; insert: string }[],
) {
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  }
  return text;
}

const resolve = (linkpath: string) =>
  linkpath.replace(/\.md$/u, "") === "probe" ? "probe.md" : undefined;

test("the heading at the caret is an ATX heading the note has, not a # line in code", () => {
  const heading = headingAt(PROBE, PROBE.indexOf("Old Name") + 2)!;
  assert.equal(heading.name, "Old Name");
  assert.equal(PROBE.slice(heading.nameFrom, heading.nameTo), "Old Name");
  assert.equal(headingAt(PROBE, PROBE.indexOf("text")), undefined);
  assert.equal(headingAt("```\n# not a heading\n```", 6), undefined);
  assert.equal(headingAt("## Closed ##", 4)?.name, "Closed");
});

test("renaming a heading updates the links to it in the note and in other notes, as Obsidian does", () => {
  const heading = headingAt(PROBE, PROBE.indexOf("Old Name"))!;
  const renamed: RenamedHeading = {
    path: "probe.md",
    text: PROBE,
    heading,
    name: "New Name",
  };
  const own = apply(PROBE, [
    { from: heading.nameFrom, to: heading.nameTo, insert: "New Name" },
    ...headingLinkEdits(PROBE, "probe.md", renamed, resolve),
  ]);
  assert.equal(
    own,
    "# Top\n\n## New Name\n\ntext [[#New Name]] and [x](#New%20Name)\n\n### Sub\n\nbody",
  );
  assert.equal(
    apply(OTHER, headingLinkEdits(OTHER, "other.md", renamed, resolve)),
    "[[probe#New Name]] [[probe#New Name|alias]] [y](probe.md#New%20Name) [[probe#Old Name#Sub]] [[probe#Top#Old Name]] [[probe#New Name]] ![[probe#New Name]]",
  );
});

test("a new heading name must not break the links to it", () => {
  assert.equal(headingNameProblem("Fine name"), undefined);
  assert.ok(headingNameProblem("  "));
  for (const bad of ["a#b", "a|b", "a^b", "a[b", "a]b"]) {
    assert.ok(headingNameProblem(bad), bad);
  }
});
