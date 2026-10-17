import test from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_COMMANDS,
  isCursorHost,
  openCursorChat,
  openCursorEdit,
} from "../../../src/plugins/cursorBridge/cursor";

test("isCursorHost matches Cursor app names only", () => {
  assert.equal(isCursorHost("Cursor"), true);
  assert.equal(isCursorHost("Cursor Nightly"), true);
  assert.equal(isCursorHost("Visual Studio Code"), false);
  assert.equal(isCursorHost("Code"), false);
});

function host(commands: string[]) {
  const ran: string[] = [];
  const copied: string[] = [];
  return {
    ran,
    copied,
    execute: async (id: string) => {
      if (!commands.includes(id)) {
        throw new Error(`command '${id}' not found`);
      }
      ran.push(id);
    },
    copy: async (text: string) => {
      copied.push(text);
    },
  };
}

test("Chat prefers aichat.newchataction when present", async () => {
  const commands = [CURSOR_COMMANDS.chat, CURSOR_COMMANDS.chatFallback];
  const h = host(commands);
  assert.equal(
    await openCursorChat(h.execute, h.copy, "sel", new Set(commands)),
    "chat",
  );
  assert.deepEqual(h.ran, [CURSOR_COMMANDS.chat]);
  assert.deepEqual(h.copied, []);
});

test("Chat falls back to composer.newAgentChat and copies the selection", async () => {
  const commands = [CURSOR_COMMANDS.chatFallback];
  const h = host(commands);
  assert.equal(
    await openCursorChat(h.execute, h.copy, "sel", new Set(commands)),
    "chatFallback",
  );
  assert.deepEqual(h.ran, [CURSOR_COMMANDS.chatFallback]);
  assert.deepEqual(h.copied, ["sel"]);
});

test("Chat copies when no Cursor chat command exists", async () => {
  const h = host([]);
  assert.equal(
    await openCursorChat(h.execute, h.copy, "sel", new Set()),
    "clipboard",
  );
  assert.deepEqual(h.ran, []);
  assert.deepEqual(h.copied, ["sel"]);
});

test("Edit runs aipopup.action.modal.generate", async () => {
  const commands = [CURSOR_COMMANDS.edit];
  const h = host(commands);
  assert.equal(await openCursorEdit(h.execute, new Set(commands)), "edit");
  assert.deepEqual(h.ran, [CURSOR_COMMANDS.edit]);
});

test("Edit returns undefined when the command is missing", async () => {
  const h = host([]);
  assert.equal(await openCursorEdit(h.execute, new Set()), undefined);
  assert.deepEqual(h.ran, []);
});
