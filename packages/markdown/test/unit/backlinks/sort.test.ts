import test from "node:test";
import assert from "node:assert/strict";
import { sortBacklinkPaths } from "../../../src/plugins/backlinks/tree";

test("backlink files sort alphabetically by basename then path (Obsidian default)", () => {
  assert.deepEqual(
    sortBacklinkPaths([
      "zoo/Zebra.md",
      "Alpha.md",
      "notes/beta.md",
      "notes/Alpha.md",
    ]),
    ["Alpha.md", "notes/Alpha.md", "notes/beta.md", "zoo/Zebra.md"],
  );
});
