import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";

test("Cursor chat and edit keys work without a selection and take precedence over Vim and Insert Link", async () => {
  const generated = await contributions();
  const edit = generated.keybindings.find(
    (item) => item.command === "lumiere.markdown.cursorBridge.edit",
  );
  const chat = generated.keybindings.find(
    (item) => item.command === "lumiere.markdown.cursorBridge.chat",
  );
  const insertLink = generated.keybindings.find(
    (item) =>
      item.command === "lumiere.markdown.insertLink" && item.key === "ctrl+k",
  );
  assert.ok(edit?.when?.includes("lumiere.markdown.isCursorHost"));
  assert.ok(!edit?.when?.includes("lumiere.markdown.hasSelection"));
  assert.ok(edit?.when?.includes("lumiere.markdown.plugin.cursorBridge"));
  assert.ok(chat?.when?.includes("lumiere.markdown.isCursorHost"));
  assert.ok(!chat?.when?.includes("lumiere.markdown.hasSelection"));
  assert.ok(insertLink?.when?.includes("!lumiere.markdown.isCursorHost"));
  const linkPalette = generated.menus.commandPalette.find(
    (item) => item.command === "lumiere.markdown.insertLink",
  );
  assert.ok(linkPalette);
  assert.ok(!linkPalette.when?.includes("isCursorHost"));
  const consume = generated.keybindings.find(
    (item) =>
      item.command === "lumiere.markdown.consumeVimHostShortcut" &&
      item.key === "ctrl+k",
  );
  assert.ok(consume?.when?.includes("!lumiere.markdown.isCursorHost"));
  assert.ok(
    !generated.keybindings.some(
      (item) =>
        item.command === "lumiere.markdown.consumeVimHostShortcut" &&
        item.key === "ctrl+l",
    ),
  );
});
