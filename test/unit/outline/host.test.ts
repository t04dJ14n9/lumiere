import test from "node:test";
import assert from "node:assert/strict";
import {
  DISABLE_FOLLOW_COMMAND,
  ENABLE_FOLLOW_COMMAND,
  EXPAND_ALL_COMMAND,
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
    fixture.reveals.map((reveal) => reveal.node.label),
    ["One", "Two", "Three", "Four", "Five", "Six", "Other"],
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
    "markdownWorkshop.outline.removeView",
  ]);
  fixture.show(false);
  await fixture.fake.commands.get(TOGGLE_COMMAND)!();
  assert.deepEqual(fixture.executed.at(-1), ["markdownWorkshop.outline.focus"]);
});
