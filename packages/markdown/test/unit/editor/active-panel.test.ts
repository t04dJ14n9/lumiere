import test from "node:test";
import assert from "node:assert/strict";
import { panelIsActive } from "../../../src/host/active-panel";

const expected = { viewType: "lumiere.markdown.editor", uri: "file:///a.md" };
const tab = (over: Partial<Parameters<typeof panelIsActive>[1]> = {}) => ({
  groupColumn: 1,
  viewType: expected.viewType,
  uri: expected.uri,
  ...over,
});

test("a panel that regained focus counts as active even while the tab model lags", () => {
  // After Ctrl+N and closing the text editor, the active tab can still be
  // the closed text editor's when the panel reports itself active.
  assert.equal(
    panelIsActive(
      { active: true, viewColumn: 1 },
      tab({ viewType: undefined, uri: "untitled:Untitled-1" }),
      expected,
    ),
    true,
  );
});

test("an inactive panel is active only when the active tab shows its note", () => {
  const panel = { active: false, viewColumn: 1 };
  assert.equal(panelIsActive(panel, tab(), expected), true);
  assert.equal(panelIsActive(panel, tab({ groupColumn: 2 }), expected), false);
  assert.equal(
    panelIsActive(panel, tab({ viewType: "default" }), expected),
    false,
  );
  assert.equal(
    panelIsActive(panel, tab({ uri: "file:///b.md" }), expected),
    false,
  );
});
