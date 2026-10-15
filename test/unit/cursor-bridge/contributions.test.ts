import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/generate-contributions";

test("cursorBridge keys require Cursor host, selection, and plugin enablement", async () => {
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
  assert.ok(edit?.when?.includes("markdownWorkshop.hasSelection"));
  assert.ok(edit?.when?.includes("markdownWorkshop.plugin.cursorBridge"));
  assert.ok(chat?.when?.includes("markdownWorkshop.isCursorHost"));
  assert.ok(
    insertLink?.when?.includes(
      "!(markdownWorkshop.isCursorHost && markdownWorkshop.hasSelection && markdownWorkshop.plugin.cursorBridge)",
    ),
  );
});
