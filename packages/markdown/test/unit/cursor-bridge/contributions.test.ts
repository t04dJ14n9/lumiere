import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";

test("Cursor chat and edit keys work without a selection and take precedence over Vim and Insert Link", async () => {
  const generated = await contributions();
  const edit = generated.keybindings.find(
    (item) => item.command === "markdownWorkshop.cursorBridge.edit",
  );
  const chat = generated.keybindings.find(
    (item) => item.command === "markdownWorkshop.cursorBridge.chat",
  );
  const insertLink = generated.keybindings.find(
    (item) =>
      item.command === "markdownWorkshop.insertLink" && item.key === "ctrl+k",
  );
  assert.ok(edit?.when?.includes("markdownWorkshop.isCursorHost"));
  assert.ok(!edit?.when?.includes("markdownWorkshop.hasSelection"));
  assert.ok(edit?.when?.includes("markdownWorkshop.plugin.cursorBridge"));
  assert.ok(chat?.when?.includes("markdownWorkshop.isCursorHost"));
  assert.ok(!chat?.when?.includes("markdownWorkshop.hasSelection"));
  assert.ok(insertLink?.when?.includes("!markdownWorkshop.isCursorHost"));
  const linkPalette = generated.menus.commandPalette.find(
    (item) => item.command === "markdownWorkshop.insertLink",
  );
  assert.ok(linkPalette);
  assert.ok(!linkPalette.when?.includes("isCursorHost"));
  const consume = generated.keybindings.find(
    (item) =>
      item.command === "markdownWorkshop.consumeVimHostShortcut" &&
      item.key === "ctrl+k",
  );
  assert.ok(consume?.when?.includes("!markdownWorkshop.isCursorHost"));
  assert.ok(
    !generated.keybindings.some(
      (item) =>
        item.command === "markdownWorkshop.consumeVimHostShortcut" &&
        item.key === "ctrl+l",
    ),
  );
});
