import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";
import {
  NESTED_CONTEXT,
  SORT_FREQUENCY_CONTEXT,
  VIEW_ID,
} from "../../../src/plugins/tags/tree";

test("Tags view title exposes sort and nested toggles", async () => {
  const generated = await contributions();
  const actions = generated.menus["view/title"] ?? [];
  const frequency = actions.find(
    (action) => action.command === "lumiere.markdown.tags.sortByFrequency",
  );
  const name = actions.find(
    (action) => action.command === "lumiere.markdown.tags.sortByName",
  );
  const enableNested = actions.find(
    (action) => action.command === "lumiere.markdown.tags.enableNested",
  );
  const disableNested = actions.find(
    (action) => action.command === "lumiere.markdown.tags.disableNested",
  );
  assert.ok(frequency);
  assert.ok(name);
  assert.ok(enableNested);
  assert.ok(disableNested);
  assert.ok(frequency.when.includes(`view == ${VIEW_ID}`));
  assert.ok(frequency.when.includes(SORT_FREQUENCY_CONTEXT));
  assert.ok(name.when.includes(`!${SORT_FREQUENCY_CONTEXT}`));
  assert.ok(enableNested.when.includes(`!${NESTED_CONTEXT}`));
  assert.ok(disableNested.when.includes(NESTED_CONTEXT));
});
