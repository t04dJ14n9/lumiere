import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";

const COLOURS = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"];

test("the note's menu groups formatting into Format, Highlight and Insert submenus", async () => {
  const generated = await contributions();
  assert.deepEqual(generated.submenus, [
    { id: "lumiere.markdown.menu.format", label: "Format" },
    { id: "lumiere.markdown.menu.highlight", label: "Highlight" },
    { id: "lumiere.markdown.menu.insert", label: "Insert" },
  ]);
  const note = generated.menus["webview/context"];
  assert.deepEqual(
    note.filter((entry) => entry.submenu),
    generated.submenus.map((submenu, index) => ({
      submenu: submenu.id,
      when: "webviewId == 'lumiere.markdown.editor'",
      group: `formatting@${index + 1}`,
    })),
  );
  // Nothing formatting is left at the top, where the list was too long to tap through.
  assert.deepEqual(
    note
      .flatMap((entry) => entry.command ?? [])
      .filter((command) => command.startsWith("lumiere.markdown.")),
    ["lumiere.markdown.copyLinkForAgent", "lumiere.markdown.selectionActions"],
  );
  const shortTitles = (menu: { command: string }[]) =>
    menu.map(
      ({ command }) =>
        generated.commands.find((entry) => entry.command === command)
          ?.shortTitle,
    );
  assert.deepEqual(
    shortTitles(generated.menus["lumiere.markdown.menu.format"] ?? []),
    ["Bold", "Italics", "Strikethrough", "Highlight", "Inline Code"],
  );
  assert.deepEqual(
    shortTitles(generated.menus["lumiere.markdown.menu.highlight"] ?? []),
    COLOURS,
  );
  assert.deepEqual(
    shortTitles(generated.menus["lumiere.markdown.menu.insert"] ?? []),
    ["Link"],
  );
});

test("a submenu's items keep their own clauses, so a submenu hides with its plugin", async () => {
  const generated = await contributions();
  for (const { id } of generated.submenus) {
    for (const item of generated.menus[id] ?? []) {
      assert.match(item.when, /lumiere\.markdown\.plugin\.formatting/, id);
      assert.ok(item.when.includes("webviewSection == 'markdownContent'"));
    }
  }
  const colours = generated.menus["lumiere.markdown.menu.highlight"] ?? [];
  assert.deepEqual(
    colours.map((item) => [item.command, item.group]),
    COLOURS.map((colour, index) => [
      `lumiere.markdown.toggleHighlight${colour}`,
      `formattingColour@${index + 1}`,
    ]),
  );
});

test("webview/context gates on webviewId (not activeCustomEditorId)", async () => {
  const generated = await contributions();
  const actions = generated.menus["webview/context"] ?? [];
  const copyLink = actions.find(
    (action) => action.command === "lumiere.markdown.copyLinkForAgent",
  );
  assert.ok(copyLink, "Copy Link for Agent on webview/context");
  assert.match(copyLink.when, /webviewId == 'lumiere\.markdown\.editor'/);
  assert.ok(!copyLink.when.includes("activeCustomEditorId"));
  assert.ok(copyLink.when.includes("lumiere.markdown.hasSelection"));
  assert.equal(copyLink.group, "0_agent@1");
  const bold = generated.menus["lumiere.markdown.menu.format"]?.find(
    (action) => action.command === "lumiere.markdown.toggleBold",
  );
  assert.ok(bold);
  assert.match(bold.when, /webviewId == 'lumiere\.markdown\.editor'/);
  assert.ok(!bold.when.includes("activeCustomEditorId"));
});
