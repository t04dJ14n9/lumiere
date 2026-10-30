import test from "node:test";
import assert from "node:assert/strict";
import {
  DISABLE_FOLLOW_COMMAND,
  ENABLE_FOLLOW_COMMAND,
  EXPAND_ALL_COMMAND,
  EXPAND_MODE_SETTING,
  FOLLOW_CURSOR_SETTING,
  OPEN_COMMAND,
  TOGGLE_COMMAND,
} from "../../../src/plugins/outline/commands";
import { deferred, outlineFixture, tick } from "./fixture";
import { render, uriOf, wait } from "../views/fakes";

test("the Markdown Outline shows and follows the first editor opened", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  assert.equal(fixture.view.message, "No headings.");
  const { panel } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  assert.equal(fixture.view.message, undefined);
  assert.deepEqual(await render(fixture.view.source), [["Title", ["Part"]]]);
  assert.equal(fixture.reveals.at(-1)?.node.label, "Title");
  assert.deepEqual(fixture.reveals.at(-1)?.options, {
    select: true,
    focus: false,
  });
  assert.deepEqual(fixture.treeOptions, { showCollapseAll: true });
  assert.equal(fixture.commandsAvailable, true);
  assert.deepEqual(fixture.warnings, []);
});

test("opening from a native selection leaves the Search sidebar in place", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel } = fixture.panel("search-result");
  Object.assign(panel, { openedFromNativeSelection: true });

  fixture.open(panel);
  await tick();

  assert.deepEqual(
    fixture.executed.filter(([command]) =>
      [
        "outline.removeView",
        "lumiere.markdown.outline.focus",
        "workbench.action.focusActiveEditorGroup",
      ].includes(String(command)),
    ),
    [],
  );
});

test("Follow Cursor commands persist the setting and update the checked context", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  assert.equal(fixture.followsCursor, true);
  await fixture.fake.commands.get(DISABLE_FOLLOW_COMMAND)!();
  assert.equal(fixture.followsCursor, false);
  fixture.reveals.length = 0;
  const calls = cursor.calls;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(cursor.calls, calls);
  assert.equal(fixture.reveals.length, 0);
  await fixture.fake.commands.get(ENABLE_FOLLOW_COMMAND)!();
  assert.equal(fixture.followsCursor, true);
  assert.equal(fixture.reveals.at(-1)?.node.label, "Part");
  assert.deepEqual(fixture.settingsWrites, [
    [FOLLOW_CURSOR_SETTING, false, uriOf("A.md")],
    [FOLLOW_CURSOR_SETTING, true, uriOf("A.md")],
  ]);
});

test("external settings and resource overrides follow the current panel", async (t) => {
  const fixture = await outlineFixture({ "A.md": "# A", "B.md": "# B" });
  t.after(() => fixture.root.dispose());
  fixture.fake.settings[FOLLOW_CURSOR_SETTING] = false;
  const first = fixture.panel("one");
  const second = fixture.panel("two", "B.md");
  fixture.resources.set(uriOf("B.md"), true);
  fixture.open(first.panel);
  await tick();
  assert.equal(fixture.followsCursor, false);
  assert.equal(fixture.reveals.length, 0);
  fixture.switchTo(second.panel);
  await tick();
  assert.equal(fixture.followsCursor, true);
  assert.equal(fixture.reveals.at(-1)?.node.label, "B");
  fixture.switchTo(first.panel);
  await tick();
  fixture.fake.settings[FOLLOW_CURSOR_SETTING] = true;
  fixture.configure();
  await tick();
  assert.equal(fixture.followsCursor, true);
  assert.equal(fixture.reveals.at(-1)?.node.label, "A");
});

test("cursor movement selects its section while clicks still navigate with following off", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  cursor.head = fixture.texts.get("A.md")!.indexOf("body");
  fixture.root.emit("editor/selectionChanged", panel, true);
  await tick();
  const item = fixture.reveals.at(-1)!.node;
  assert.equal(item.label, "Part");
  await fixture.fake.commands.get(DISABLE_FOLLOW_COMMAND)!();
  await fixture.fake.commands.get(OPEN_COMMAND)!(...item.command!.args!);
  assert.deepEqual(fixture.opened, [
    {
      uri: uriOf("A.md"),
      offset: fixture.texts.get("A.md")!.indexOf("## Part"),
    },
  ]);
});

test("showing a hidden view selects the latest cursor position", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  fixture.show(false);
  const { panel, cursor } = fixture.panel("one", "A.md", 20);
  fixture.open(panel);
  await tick();
  assert.equal(cursor.calls, 0);
  assert.equal(fixture.reveals.length, 0);
  fixture.show(true);
  await tick();
  assert.equal(fixture.reveals.at(-1)?.node.label, "Part");
});

test("an edit rebuilds and follows the active section from the authoritative text", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  fixture.texts.set("A.md", "# Updated\n## Added\nbody");
  cursor.documentVersion++;
  cursor.version++;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body");
  fixture.reveals.length = 0;
  fixture.root.emit("document/changed", panel.session);
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(
    fixture.reveals.length,
    0,
    "old heading offsets are not used during the debounce",
  );
  await wait(350);
  assert.deepEqual(await render(fixture.view.source), [["Updated", ["Added"]]]);
  assert.equal(fixture.reveals.at(-1)?.node.label, "Added");
});

test("pending captures cannot select a different panel, even for the same note", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const first = fixture.panel("one");
  const second = fixture.panel("two", "A.md", 20);
  fixture.open(first.panel);
  await tick();
  const pending = deferred<{ head: number; version: number }>();
  first.cursor.capture = () => pending.promise;
  fixture.root.emit("editor/selectionChanged", first.panel, false);
  await tick();
  fixture.reveals.length = 0;
  fixture.switchTo(second.panel);
  await tick();
  pending.resolve({ head: 0, version: 0 });
  await tick();
  assert.deepEqual(
    fixture.reveals.map((reveal) => reveal.node.label),
    ["Part"],
  );
  fixture.root.emit("editor/selectionChanged", first.panel, false);
  await tick();
  assert.equal(fixture.reveals.length, 1);
});

test("newer cursor captures supersede older replies", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  const pending = deferred<{ head: number; version: number }>();
  cursor.capture = () => pending.promise;
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  fixture.reveals.length = 0;
  cursor.capture = async () => ({ head: 20, version: 0 });
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  pending.resolve({ head: 0, version: 0 });
  await tick();
  assert.deepEqual(
    fixture.reveals.map((reveal) => reveal.node.label),
    ["Part"],
  );
});

test("a capture from an older document or synchronization version is ignored", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  fixture.reveals.length = 0;
  cursor.version = 2;
  cursor.capture = async () => ({ head: 20, version: 1 });
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(fixture.reveals.length, 0);

  const pending = deferred<{ head: number; version: number }>();
  cursor.capture = () => pending.promise;
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  cursor.documentVersion++;
  pending.resolve({ head: 20, version: 2 });
  await tick();
  assert.equal(fixture.reveals.length, 0);
});

test("a failed cursor RPC is contained and subsequent movement still follows", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  const failure = new Error("panel RPC unavailable");
  cursor.capture = async () => {
    throw failure;
  };
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.deepEqual(fixture.warnings, [failure]);
  fixture.reveals.length = 0;
  cursor.capture = async () => ({ head: 20, version: 0 });
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(fixture.reveals.at(-1)?.node.label, "Part");
});

test("turning follow off or disposing cancels an in-flight capture", async (t) => {
  for (const stop of ["disable", "dispose"]) {
    const fixture = await outlineFixture();
    t.after(() => fixture.root.dispose());
    const { panel, cursor } = fixture.panel("one");
    fixture.open(panel);
    await tick();
    const pending = deferred<{ head: number; version: number }>();
    cursor.capture = () => pending.promise;
    fixture.root.emit("editor/selectionChanged", panel, false);
    await tick();
    fixture.reveals.length = 0;
    if (stop === "disable") {
      await fixture.fake.commands.get(DISABLE_FOLLOW_COMMAND)!();
    } else {
      await fixture.root.dispose();
    }
    pending.resolve({ head: 20, version: 0 });
    await tick();
    assert.equal(fixture.reveals.length, 0, stop);
  }
});

test("Expand All visits every level and preserves selection and focus", async (t) => {
  const text =
    "# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six\n# Other\n";
  const fixture = await outlineFixture({ "A.md": text });
  t.after(() => fixture.root.dispose());
  fixture.fake.settings[FOLLOW_CURSOR_SETTING] = false;
  fixture.open(fixture.panel("one").panel);
  await tick();
  await fixture.fake.commands.get(EXPAND_ALL_COMMAND)!();
  assert.deepEqual(
    fixture.expands.map((node) => node.label),
    ["One", "Two", "Three", "Four", "Five"],
    "each parent is recorded open so a later collapse can close it",
  );
  assert.deepEqual(
    fixture.reveals.map((reveal) => reveal.node.label),
    ["Six", "Other"],
  );
  for (const reveal of fixture.reveals) {
    assert.deepEqual(reveal.options, {
      expand: true,
      select: false,
      focus: false,
    });
  }
});

test("stopping the plugin removes commands, view and follow context", async () => {
  const fixture = await outlineFixture();
  fixture.open(fixture.panel("one").panel);
  await tick();
  await fixture.root.dispose();
  assert.equal(fixture.view.disposed, true);
  assert.equal(fixture.fake.commands.size, 0);
  assert.equal(fixture.followsCursor, undefined);
  assert.equal(fixture.commandsAvailable, undefined);
  assert.deepEqual(fixture.warnings, []);
});

// A1a and A2 have child headings, so they are expandable. `body-a` still
// sits in A1a (before its child), which is the node Follow Cursor reveals.
const NESTED = `# A
## A1
### A1a
body-a
#### Detail
## A2
### A2a
body-a2
# B
## B1
### B1a
body-b
`;

test("accordion follow expands only the active path and does not refresh", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  const refreshAfterOpen = fixture.refreshCount;
  const collapseAllBeforeFollow = fixture.collapseAllCount;
  fixture.expands.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(fixture.refreshCount, refreshAfterOpen, "no caret-only refresh");
  assert.equal(
    fixture.collapseAllCount,
    collapseAllBeforeFollow + 1,
    "native collapse all resets every off-path branch",
  );
  assert.deepEqual(
    fixture.expands.map((node) => node.label).sort(),
    ["A", "A1", "A1a"].sort(),
  );
  assert.equal(fixture.reveals.at(-1)?.node.label, "A1a");
});

test("unchanged accordion path skips expand/collapse", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a") + 1;
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.deepEqual(fixture.expands, []);
  assert.deepEqual(fixture.collapses, []);
  assert.equal(fixture.reveals.at(-1)?.node.label, "A1a");
});

test("accordion chapter switch closes the prior path in the tree UI", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  const collapseAllBeforeSwitch = fixture.collapseAllCount;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-b");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();

  assert.equal(
    fixture.collapseAllCount,
    collapseAllBeforeSwitch + 1,
    "chapter switch resets native expansion before opening the next path",
  );
  assert.equal(fixture.isOpen("A"), false, "prior chapter closes");
  assert.equal(fixture.isOpen("A1"), false, "prior ancestor closes");
  assert.equal(fixture.isOpen("A1a"), false, "prior nested branch closes");
  assert.equal(
    fixture.isOpen("A2"),
    false,
    "prior sibling branch stays closed",
  );
  assert.equal(fixture.isOpen("B"), true, "active chapter is open");
  assert.equal(fixture.isOpen("B1"), true, "active nested branch is open");
  assert.equal(fixture.reveals.at(-1)?.node.label, "B1a");
});

test("expandMode all keeps parents expanded on build and only reveals on follow", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  fixture.fake.settings[EXPAND_MODE_SETTING] = "all";
  fixture.configure();
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  const roots = await fixture.view.source.roots();
  assert.equal(roots[0]?.expanded, true);
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-b");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.deepEqual(fixture.expands, []);
  assert.deepEqual(fixture.collapses, []);
  assert.equal(fixture.reveals.at(-1)?.node.label, "B1a");
});

test("Expand All is folded back to the active path on the next follow", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  await fixture.fake.commands.get(EXPAND_ALL_COMMAND)!();
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  const collapseAllBeforeFollow = fixture.collapseAllCount;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a") + 1;
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(
    fixture.collapseAllCount,
    collapseAllBeforeFollow + 1,
    "the next follow resets every branch Expand All opened",
  );
  assert.equal(fixture.reveals.at(-1)?.node.label, "A1a");
  assert.equal(fixture.isOpen("A"), true);
  assert.equal(fixture.isOpen("A1"), true);
  assert.equal(fixture.isOpen("A1a"), true);
  assert.equal(
    fixture.isOpen("A2"),
    false,
    "sibling opened by Expand All collapses",
  );
  assert.equal(
    fixture.isOpen("B"),
    false,
    "other chapter opened by Expand All collapses",
  );
});

test("Toggle Markdown Outline targets the view's hide command and restores it with focus", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  fixture.executed.length = 0;
  fixture.show(true);
  await fixture.fake.commands.get(TOGGLE_COMMAND)!();
  assert.deepEqual(fixture.executed.at(-1), [
    "lumiere.markdown.outline.removeView",
  ]);
  fixture.show(false);
  await fixture.fake.commands.get(TOGGLE_COMMAND)!();
  assert.deepEqual(fixture.executed.at(-1), ["lumiere.markdown.outline.focus"]);
});
