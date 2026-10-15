import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/generate-contributions";

test("cursorBridge keys require Cursor host, selection, and plugin enablement", async () => {
  const generated = await contributions();
  const edit = generated.keybindings.find(
    (item) => item.command === "markdownWorkbench.cursorBridge.edit",
  );
  const chat = generated.keybindings.find(
    (item) => item.command === "markdownWorkbench.cursorBridge.chat",
  );
  const insertLink = generated.keybindings.find(
    (item) =>
      item.command === "markdownWorkbench.insertLink" && item.key === "ctrl+k",
  );
  assert.ok(edit?.when?.includes("markdownWorkbench.isCursorHost"));
  assert.ok(edit?.when?.includes("markdownWorkbench.hasSelection"));
  assert.ok(edit?.when?.includes("markdownWorkbench.plugin.cursorBridge"));
  assert.ok(chat?.when?.includes("markdownWorkbench.isCursorHost"));
  assert.ok(
    insertLink?.when?.includes(
      "!(markdownWorkbench.isCursorHost && markdownWorkbench.hasSelection && markdownWorkbench.plugin.cursorBridge)",
    ),
  );
});
