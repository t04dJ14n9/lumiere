import test from "node:test";
import assert from "node:assert/strict";
import type { PickItem } from "../../../src/shared/runtime";
import { GO_TO_HEADING_COMMAND } from "../../../src/plugins/outline/commands";
import { deferred, outlineFixture, tick } from "./fixture";
import { uriOf } from "../views/fakes";

test("Go to Heading lists parsed headings in document order, filters them and jumps to the selected source offset", async (t) => {
  const text = [
    "---",
    "title: frontmatter",
    "---",
    "# **Title**",
    "intro",
    "### Deep",
    "## Part",
    "body",
    "## Part",
    "```md",
    "# Fenced",
    "```",
    "# ",
  ].join("\r\n");
  const fixture = await outlineFixture({ "A.md": text });
  t.after(() => fixture.root.dispose());
  fixture.open(fixture.panel("one").panel);
  fixture.fake.views.pick = async ({ placeholder, items }) => {
    assert.equal(placeholder, "Go to heading…");
    assert.deepEqual(
      items("").map(({ label, description, detail }) => ({
        label,
        description,
        detail,
      })),
      [
        { label: "Title", description: "H1", detail: undefined },
        { label: "Deep", description: "H3", detail: "Title" },
        { label: "Part", description: "H2", detail: "Title" },
        { label: "Part", description: "H2", detail: "Title" },
        { label: "(empty)", description: "H1", detail: undefined },
      ],
    );
    assert.deepEqual(
      items("dp").map((item) => item.label),
      ["Deep"],
    );
    assert.equal(items("absent").length, 0);
    const parts = items("part");
    assert.equal(parts.length, 2);
    return { item: parts[1]!, query: "part" };
  };
  await fixture.fake.commands.get(GO_TO_HEADING_COMMAND)!();
  assert.deepEqual(fixture.opened, [
    { uri: uriOf("A.md"), offset: text.lastIndexOf("## Part") },
  ]);
});

test("switching between Workshop and a text split rechecks the active panel and rebuilds headings without an edit", async (t) => {
  const fixture = await outlineFixture({
    "A.md": "# A",
    "B.md": "# B\n## Nested",
  });
  t.after(() => fixture.root.dispose());
  const first = fixture.panel("one").panel;
  const second = fixture.panel("two", "B.md").panel;
  const shown: unknown[][] = [];
  fixture.fake.views.pick = async ({ items }) => {
    const choices = items("");
    shown.push(choices.map((item) => item.label));
    return { item: choices[0]!, query: "" };
  };
  const go = fixture.fake.commands.get(GO_TO_HEADING_COMMAND)!;
  fixture.open(first);
  await go();
  fixture.switchTo(undefined);
  await go();
  fixture.switchTo(first);
  await go();
  fixture.switchTo(second);
  await go();
  assert.deepEqual(shown, [["A"], ["A"], ["B", "Nested"]]);
  assert.deepEqual(
    fixture.opened.map((item) => item.uri),
    [uriOf("A.md"), uriOf("A.md"), uriOf("B.md")],
  );
});

test("cancel and an empty document never navigate", async (t) => {
  const fixture = await outlineFixture({ "A.md": "body without headings" });
  t.after(() => fixture.root.dispose());
  fixture.open(fixture.panel("one").panel);
  fixture.fake.views.pick = async ({ items, placeholder }) => {
    assert.equal(placeholder, "No headings in this note.");
    assert.deepEqual(items(""), []);
    return undefined;
  };
  await fixture.fake.commands.get(GO_TO_HEADING_COMMAND)!();
  assert.deepEqual(fixture.opened, []);
});

test("a pending picker cannot jump after an edit, panel switch, text split or plugin disposal", async (t) => {
  for (const change of ["edit", "otherPanel", "textSplit", "dispose"]) {
    const fixture = await outlineFixture();
    t.after(() => fixture.root.dispose());
    const first = fixture.panel("one");
    fixture.open(first.panel);
    const accepted = deferred<void>();
    let choices: readonly PickItem<unknown>[] = [];
    fixture.fake.views.pick = async ({ items }) => {
      const snapshot = items("");
      choices = snapshot;
      await accepted.promise;
      return { item: snapshot[0]!, query: "" };
    };
    const pending = fixture.fake.commands.get(GO_TO_HEADING_COMMAND)!();
    await tick();
    assert.equal(choices.length, 2, change);
    if (change === "edit") {
      fixture.texts.set("A.md", "prefix\n# Changed");
      first.cursor.documentVersion++;
    } else if (change === "otherPanel") {
      fixture.switchTo(fixture.panel("two").panel);
    } else if (change === "textSplit") {
      fixture.switchTo(undefined);
    } else {
      await fixture.root.dispose();
    }
    accepted.resolve();
    await pending;
    assert.deepEqual(fixture.opened, [], change);
    assert.deepEqual(fixture.warnings, [], change);
  }
});

test("each picker invocation sees unsaved authoritative heading edits", async (t) => {
  const fixture = await outlineFixture();
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  const shown: unknown[][] = [];
  fixture.fake.views.pick = async ({ items }) => {
    shown.push(items("").map((item) => item.label));
    return undefined;
  };
  const go = fixture.fake.commands.get(GO_TO_HEADING_COMMAND)!;
  await go();
  fixture.texts.set("A.md", "# Updated\n## Added");
  cursor.documentVersion++;
  await go();
  assert.deepEqual(shown, [
    ["Title", "Part"],
    ["Updated", "Added"],
  ]);
});
