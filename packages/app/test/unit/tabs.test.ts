import test from "node:test";
import assert from "node:assert/strict";
import {
  noTabs,
  SETTINGS_TAB,
  tabId,
  tabsReducer,
  tabTitle,
  tabToClose,
  type TabsState,
} from "../../src/shell/tabs";

const open = (state: TabsState, path: string, vault = "/v") =>
  tabsReducer(state, { type: "open", vault, path });

test("opening a file twice shows its one tab", () => {
  let state = open(noTabs, "a.md");
  state = open(state, "b.md");
  state = open(state, "a.md");
  assert.deepEqual(
    state.tabs.map((tab) => tabTitle(tab)),
    ["a", "b"],
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

test("Settings opens once, as a tab beside the notes, and closes like one", () => {
  let state = open(noTabs, "a.md");
  state = tabsReducer(state, { type: "openSettings" });
  state = tabsReducer(state, { type: "activate", id: tabId("/v", "a.md") });
  state = tabsReducer(state, { type: "openSettings" });
  assert.deepEqual(
    state.tabs.map((tab) => tabTitle(tab)),
    ["a", "Settings"],
  );
  assert.equal(state.active, SETTINGS_TAB);
  state = tabsReducer(state, { type: "close", id: SETTINGS_TAB });
  assert.equal(state.active, tabId("/v", "a.md"));
});

test("⌘W closes the shown tab while there are others, and leaves the last to the window", () => {
  assert.equal(tabToClose(noTabs), undefined);
  const one = open(noTabs, "a.md");
  assert.equal(tabToClose(one), undefined);
  const two = open(one, "b.md");
  assert.equal(tabToClose(two), tabId("/v", "b.md"));
  const back = tabsReducer(two, { type: "activate", id: tabId("/v", "a.md") });
  assert.equal(tabToClose(back), tabId("/v", "a.md"));
});

test("⌃⇥ goes back to the tab shown before, so it switches between two", () => {
  let state = ["a.md", "b.md", "c.md"].reduce(
    (s, path) => open(s, path),
    noTabs,
  );
  state = tabsReducer(state, { type: "activate", id: tabId("/v", "a.md") });
  state = tabsReducer(state, { type: "last" });
  assert.equal(state.active, tabId("/v", "c.md"));
  state = tabsReducer(state, { type: "last" });
  assert.equal(state.active, tabId("/v", "a.md"));
  // Closing the shown tab forgets it: back to the one before.
  state = tabsReducer(state, { type: "close", id: tabId("/v", "a.md") });
  state = tabsReducer(state, { type: "last" });
  assert.notEqual(state.active, tabId("/v", "a.md"));
  assert.equal(tabsReducer(noTabs, { type: "last" }), noTabs);
});

test("next and previous step through the tabs in order, wrapping", () => {
  let state = ["a.md", "b.md", "c.md"].reduce(
    (s, path) => open(s, path),
    noTabs,
  );
  state = tabsReducer(state, { type: "step", by: 1 });
  assert.equal(state.active, tabId("/v", "a.md"));
  state = tabsReducer(state, { type: "step", by: -1 });
  assert.equal(state.active, tabId("/v", "c.md"));
  state = tabsReducer(state, { type: "step", by: -1 });
  assert.equal(state.active, tabId("/v", "b.md"));
});
