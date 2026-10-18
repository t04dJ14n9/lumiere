import test from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_COMMANDS,
  cursorEditAvailable,
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
  const args: unknown[][] = [];
  const copied: string[] = [];
  return {
    ran,
    args,
    copied,
    execute: async (id: string, ...rest: unknown[]) => {
      if (!commands.includes(id)) {
        throw new Error(`command '${id}' not found`);
      }
      ran.push(id);
      args.push(rest);
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

test("Chat without a selection preserves the clipboard on fallback or unavailability", async () => {
  for (const [commands, expected] of [
    [[CURSOR_COMMANDS.chatFallback], "chatFallback"],
    [[], "unavailable"],
  ] as const) {
    const h = host([...commands]);
    assert.equal(
      await openCursorChat(h.execute, h.copy, "", new Set(commands)),
      expected,
    );
    assert.deepEqual(h.copied, []);
  }
});

test("Edit runs aipopup.action.modal.generate with Monaco override args", async () => {
  const commands = [CURSOR_COMMANDS.edit];
  const h = host(commands);
  const uri = { toString: () => "file:///vault/Note.md" };
  assert.equal(
    await openCursorEdit(h.execute, new Set(commands), {
      uri,
      range: {
        start: { line: 2, character: 4 },
        end: { line: 3, character: 1 },
      },
    }),
    "edit",
  );
  assert.deepEqual(h.ran, [CURSOR_COMMANDS.edit]);
  assert.deepEqual(h.args, [
    [
      {
        overrideUri: uri,
        overrideRange: {
          startLineNumber: 3,
          startColumn: 5,
          endLineNumber: 4,
          endColumn: 2,
        },
        invocationType: "new",
      },
    ],
  ]);
});

test("Edit returns undefined when the command is missing", async () => {
  const h = host([]);
  assert.equal(await openCursorEdit(h.execute, new Set()), undefined);
  assert.deepEqual(h.ran, []);
});

test("Edit returns undefined when the command set excludes Edit", async () => {
  const h = host([CURSOR_COMMANDS.edit]);
  assert.equal(
    await openCursorEdit(h.execute, new Set([CURSOR_COMMANDS.chat])),
    undefined,
  );
  assert.deepEqual(h.ran, []);
});

test("cursorEditAvailable is true when the command set is unknown or includes Edit", () => {
  assert.equal(cursorEditAvailable(undefined), true);
  assert.equal(cursorEditAvailable(new Set([CURSOR_COMMANDS.edit])), true);
  assert.equal(cursorEditAvailable(new Set()), false);
  assert.equal(cursorEditAvailable(new Set([CURSOR_COMMANDS.chat])), false);
});
