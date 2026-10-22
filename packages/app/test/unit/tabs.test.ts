import test from "node:test";
import assert from "node:assert/strict";
import {
  noTabs,
  tabId,
  tabsReducer,
  type TabsState,
} from "../../src/shell/tabs";

const open = (state: TabsState, path: string, vault = "/v") =>
  tabsReducer(state, { type: "open", vault, path });

test("opening a file twice shows its one tab", () => {
  let state = open(noTabs, "a.md");
  state = open(state, "b.md");
  state = open(state, "a.md");
  assert.deepEqual(
    state.tabs.map((tab) => tab.path),
    ["a.md", "b.md"],
  );
  assert.equal(state.active, tabId("/v", "a.md"));
  // The same path in another vault is another tab.
  assert.equal(open(state, "a.md", "/w").tabs.length, 3);
});

test("closing the shown tab shows its right neighbour, else its left one", () => {
  let state = ["a.md", "b.md", "c.md"].reduce(
    (s, path) => open(s, path),
    noTabs,
  );
  state = tabsReducer(state, { type: "activate", id: tabId("/v", "b.md") });
  state = tabsReducer(state, { type: "close", id: tabId("/v", "b.md") });
  assert.equal(state.active, tabId("/v", "c.md"));
  state = tabsReducer(state, { type: "close", id: tabId("/v", "c.md") });
  assert.equal(state.active, tabId("/v", "a.md"));
  state = tabsReducer(state, { type: "close", id: tabId("/v", "a.md") });
  assert.deepEqual(state, noTabs);
});

test("closing a hidden tab keeps the shown one; unknown ids change nothing", () => {
  let state = ["a.md", "b.md"].reduce((s, path) => open(s, path), noTabs);
  state = tabsReducer(state, { type: "close", id: tabId("/v", "a.md") });
  assert.equal(state.active, tabId("/v", "b.md"));
  assert.equal(tabsReducer(state, { type: "close", id: "nope" }), state);
  assert.equal(tabsReducer(state, { type: "activate", id: "nope" }), state);
});
