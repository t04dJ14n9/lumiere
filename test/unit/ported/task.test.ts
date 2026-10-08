import test from "node:test";
import assert from "node:assert/strict";
import { taskMarker } from "../../../src/markdown/tasks";

test("task markers preserve quote prefixes, ordered lists and custom status", () => {
  for (const line of ["- [ ] ordinary", "> > 12. [x] nested", "  * [-] custom"]) {
    const offset = taskMarker(line)!;
    assert.equal(line[offset - 1], "[");
    assert.equal(line[offset + 1], "]");
  }
  for (const line of ["text [ ]", "```- [ ]", "- [wrong] task", "> [ ] no list"]) {
    assert.equal(taskMarker(line), undefined);
  }
});
