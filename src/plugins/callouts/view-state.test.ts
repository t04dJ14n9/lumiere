import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { DisclosureState } from "./view-state";

test("callout transfer remaps local and nested identity and refreshes live disclosures", () => {
  const state = new DisclosureState("new.md");
  const view = {} as EditorView;
  const details = { open: true };
  const nested = { open: true };
  let measures = 0;
  const binding = state.bind("new.md|a|0", details, () => measures++);
  state.bind("new.md/embed.md|a|0", nested, () => measures++);
  state.restore(
    view,
    {
      "old.md|a|0": false,
      "old.md/embed.md|a|0": false,
      "elsewhere.md|b|0": true,
    },
    "old.md",
  );
  assert.equal(details.open, false);
  assert.equal(nested.open, false);
  assert.equal(measures, 2);
  assert.deepEqual(state.capture(), {
    "new.md|a|0": false,
    "new.md/embed.md|a|0": false,
    "elsewhere.md|b|0": true,
  });
  details.open = true;
  binding.remember();
  assert.equal(state.capture()["new.md|a|0"], true);
  binding.dispose();
  state.restore(view, { "new.md|a|0": false }, "new.md");
  assert.equal(details.open, true);
  assert.equal(nested.open, true);
  const second = new DisclosureState("new.md");
  assert.deepEqual(second.capture(), {});
});
