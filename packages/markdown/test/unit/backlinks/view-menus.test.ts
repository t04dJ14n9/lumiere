import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";
import {
  SORT_ALPHABETICAL_CONTEXT,
  SORT_ALPHABETICAL_REVERSE_CONTEXT,
  SORT_MODIFIED_CONTEXT,
  SORT_MODIFIED_REVERSE_CONTEXT,
  VIEW_ID,
} from "../../../src/plugins/backlinks/tree";

test("Backlinks view title exposes Obsidian sort order cycle", async () => {
  const generated = await contributions();
  const actions = generated.menus["view/title"] ?? [];
  const byCommand = Object.fromEntries(
    actions
      .filter((action) =>
        String(action.command).startsWith("lumiere.markdown.backlinks.sortBy"),
      )
      .map((action) => [action.command, action]),
  );
  assert.equal(Object.keys(byCommand).length, 4);
  assert.ok(
    byCommand["lumiere.markdown.backlinks.sortByAlphabetical"]?.when.includes(
      SORT_ALPHABETICAL_CONTEXT,
    ),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.backlinks.sortByAlphabeticalReverse"
    ]?.when.includes(SORT_ALPHABETICAL_REVERSE_CONTEXT),
  );
  assert.ok(
    byCommand["lumiere.markdown.backlinks.sortByModifiedTime"]?.when.includes(
      SORT_MODIFIED_CONTEXT,
    ),
  );
  assert.ok(
    byCommand[
      "lumiere.markdown.backlinks.sortByModifiedTimeReverse"
    ]?.when.includes(SORT_MODIFIED_REVERSE_CONTEXT),
  );
  for (const action of Object.values(byCommand)) {
    assert.ok(action.when.includes(`view == ${VIEW_ID}`));
  }
  const titles = new Map(
    (generated.commands as { command: string; title: string }[])
      .filter((command) =>
        command.command.startsWith("lumiere.markdown.backlinks.sortBy"),
      )
      .map((command) => [command.command, command.title]),
  );
  assert.equal(
    titles.get("lumiere.markdown.backlinks.sortByAlphabetical"),
    "✓ File name (A to Z)",
  );
  assert.equal(
    titles.get("lumiere.markdown.backlinks.sortByAlphabeticalReverse"),
    "✓ File name (Z to A)",
  );
  assert.equal(
    titles.get("lumiere.markdown.backlinks.sortByModifiedTime"),
    "✓ Modified time (new to old)",
  );
  assert.equal(
    titles.get("lumiere.markdown.backlinks.sortByModifiedTimeReverse"),
    "✓ Modified time (old to new)",
  );
});
