import test from "node:test";
import assert from "node:assert/strict";
import {
  mentionNodes,
  OPEN_COMMAND,
} from "../../../src/plugins/outgoingLinks/tree";
import { contributions } from "../../../scripts/contributions";
import {
  EXTRA_CONTEXT_CONTEXT,
  VIEW_ID,
} from "../../../src/plugins/outgoingLinks/tree";

test("mentionNodes adds adjacent context rows only when present", () => {
  const match = {
    line: 1,
    col: 0,
    offset: 10,
    text: "see Atlas here",
    before: "alpha",
    after: "omega",
  };
  const nodes = mentionNodes("unlinked:Note.md", "file:///Note.md", match);
  assert.deepEqual(
    nodes.map((n) => [n.id, n.label, Boolean(n.command)]),
    [
      ["unlinked:Note.md:10:before", "alpha", false],
      ["unlinked:Note.md:10", "see Atlas here", true],
      ["unlinked:Note.md:10:after", "omega", false],
    ],
  );
  assert.equal(nodes[1]?.command?.id, OPEN_COMMAND);
  assert.equal(
    mentionNodes("unlinked:Note.md", "file:///Note.md", {
      line: 0,
      col: 0,
      offset: 0,
      text: "only",
    }).length,
    1,
  );
});

test("Outgoing links view title exposes Show More Context toggle", async () => {
  const generated = await contributions();
  const actions = generated.menus["view/title"] ?? [];
  const byCommand = Object.fromEntries(
    actions
      .filter(
        (action) =>
          String(action.command).includes("outgoingLinks.") &&
          String(action.command).includes("ExtraContext"),
      )
      .map((action) => [action.command, action]),
  );
  assert.equal(Object.keys(byCommand).length, 2);
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.enableExtraContext"
    ]?.when.includes(`!${EXTRA_CONTEXT_CONTEXT}`),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.disableExtraContext"
    ]?.when.includes(EXTRA_CONTEXT_CONTEXT),
  );
  for (const action of Object.values(byCommand)) {
    assert.ok(action.when.includes(`view == ${VIEW_ID}`));
  }
});
