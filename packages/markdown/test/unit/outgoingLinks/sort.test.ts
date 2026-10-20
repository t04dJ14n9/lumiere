import test from "node:test";
import assert from "node:assert/strict";
import {
  compareOutgoingPaths,
  sortOutgoingPaths,
} from "../../../src/plugins/outgoingLinks/tree";

test("outgoing paths sort alphabetically by basename then path", () => {
  assert.deepEqual(
    sortOutgoingPaths([
      "zoo/Zebra.md",
      "Alpha.md",
      "notes/beta.md",
      "notes/Alpha.md",
    ]),
    ["Alpha.md", "notes/Alpha.md", "notes/beta.md", "zoo/Zebra.md"],
  );
});

test("unresolved linkpaths compare like file basenames", () => {
  assert.ok(compareOutgoingPaths("Alpha", "beta") < 0);
  assert.ok(compareOutgoingPaths("notes/Zed", "Alpha") > 0);
});
