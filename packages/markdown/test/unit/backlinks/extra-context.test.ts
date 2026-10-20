import test from "node:test";
import assert from "node:assert/strict";
import { mentionNodes, OPEN_COMMAND } from "../../../src/plugins/backlinks/tree";

test("mentionNodes adds adjacent context rows only when present", () => {
  const match = {
    line: 1,
    col: 0,
    offset: 10,
    text: "see [[Target]]",
    before: "alpha",
    after: "omega",
  };
  const nodes = mentionNodes("linked:Note.md", "file:///Note.md", match);
  assert.deepEqual(
    nodes.map((n) => [n.id, n.label, Boolean(n.command)]),
    [
      ["linked:Note.md:10:before", "alpha", false],
      ["linked:Note.md:10", "see [[Target]]", true],
      ["linked:Note.md:10:after", "omega", false],
    ],
  );
  assert.equal(nodes[1]?.command?.id, OPEN_COMMAND);
  assert.equal(
    mentionNodes("linked:Note.md", "file:///Note.md", {
      line: 0,
      col: 0,
      offset: 0,
      text: "only",
    }).length,
    1,
  );
});
