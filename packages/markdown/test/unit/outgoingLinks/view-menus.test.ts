import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";
import {
  SORT_ALPHABETICAL_CONTEXT,
  SORT_ALPHABETICAL_REVERSE_CONTEXT,
  SORT_MODIFIED_CONTEXT,
  SORT_MODIFIED_REVERSE_CONTEXT,
  VIEW_ID,
} from "../../../src/plugins/outgoingLinks/tree";

test("Outgoing links view title exposes Obsidian sort order cycle", async () => {
  const generated = await contributions();
  const actions = generated.menus["view/title"] ?? [];
  const byCommand = Object.fromEntries(
    actions
      .filter((action) =>
        String(action.command).startsWith(
          "lumiere.markdown.outgoingLinks.sortBy",
        ),
      )
      .map((action) => [action.command, action]),
  );
  assert.equal(Object.keys(byCommand).length, 4);
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.sortByAlphabetical"
    ]?.when.includes(SORT_ALPHABETICAL_CONTEXT),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.sortByAlphabeticalReverse"
    ]?.when.includes(SORT_ALPHABETICAL_REVERSE_CONTEXT),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.sortByModifiedTime"
    ]?.when.includes(SORT_MODIFIED_CONTEXT),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.outgoingLinks.sortByModifiedTimeReverse"
    ]?.when.includes(SORT_MODIFIED_REVERSE_CONTEXT),
  );
  for (const action of Object.values(byCommand)) {
    assert.ok(action.when.includes(`view == ${VIEW_ID}`));
  }
});
