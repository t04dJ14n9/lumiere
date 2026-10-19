import test from "node:test";
import assert from "node:assert/strict";
import { cleanEditedUris } from "../../../src/host/rename-save";

const edit = {
  start: { line: 0, col: 0 },
  end: { line: 0, col: 1 },
  text: "x",
};

test("only notes without unsaved changes are saved after a link update", () => {
  const files = [
    { uri: "file:///a.md", edits: [edit] },
    { uri: "file:///b.md", edits: [edit] },
    { uri: "file:///c.md", edits: [] },
  ];
  assert.deepEqual(
    cleanEditedUris(files, (uri) => uri === "file:///b.md"),
    ["file:///a.md"],
  );
});
