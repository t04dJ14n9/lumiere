import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";
import {
  EDIT_PROMPT_ARMED,
  EDIT_PROMPT_VIEW,
} from "../../../src/plugins/cursorBridge/edit-prompt-probe";

test("Edit prompt when-probe remains eligible while the native mirror is active", async () => {
  const generated = await contributions();
  const probe = generated.views?.explorer.find(
    (view) => view.id === EDIT_PROMPT_VIEW,
  );
  assert.ok(probe);
  assert.equal(probe.name, "·");
  assert.ok(
    probe.when?.includes(
      `(editcontextbarcursor || editorHasPromptBar) && ${EDIT_PROMPT_ARMED}`,
    ),
  );
  assert.ok(
    probe.when?.includes(
      "config.lumiere.markdown.plugins.cursorBridge.enabled",
    ),
  );
  assert.ok(!probe.when?.includes("activeCustomEditorId"));
  assert.ok(
    !probe.when?.includes("editorPromptBarFocused"),
    "prompt presence does not require prompt focus",
  );
});

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
