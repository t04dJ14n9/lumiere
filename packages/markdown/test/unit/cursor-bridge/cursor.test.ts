import test from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_COMMANDS,
  closeCursorEditPrompt,
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

function host(commands: string[], options: { editResult?: unknown } = {}) {
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
      if (id === CURSOR_COMMANDS.edit) {
        return "editResult" in options ? options.editResult : "prompt-bar-id";
      }
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

test("Edit returns the prompt id from aipopup.action.modal.generate with Monaco overrides", async () => {
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
    "prompt-bar-id",
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

test("Edit without overrides preserves the prompt id and passes no arguments", async () => {
  const h = host([CURSOR_COMMANDS.edit], { editResult: "retry-prompt-id" });
  assert.equal(await openCursorEdit(h.execute), "retry-prompt-id");
  assert.deepEqual(h.args, [[]]);
});

test("Edit requires a nonempty prompt id to verify success", async () => {
  const commands = [CURSOR_COMMANDS.edit];
  for (const editResult of [undefined, null, false, "", 0, true, {}]) {
    const h = host(commands, { editResult });
    assert.equal(
      await openCursorEdit(h.execute, new Set(commands), {
        uri: { toString: () => "file:///vault/Note.md" },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      }),
      undefined,
      `editResult=${String(editResult)} must not count as Edit`,
    );
    assert.deepEqual(h.ran, [CURSOR_COMMANDS.edit]);
  }
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

test("closeCursorEditPrompt runs closePromptBar and swallows failures", async () => {
  const h = host([CURSOR_COMMANDS.closePromptBar]);
  await closeCursorEditPrompt(h.execute, "prompt-1");
  assert.deepEqual(h.ran, [CURSOR_COMMANDS.closePromptBar]);
  assert.deepEqual(h.args, [["prompt-1"]]);

  const ran: string[] = [];
  await closeCursorEditPrompt(async (id) => {
    ran.push(id);
    throw new Error(`command '${id}' failed`);
  }, "prompt-2");
  assert.deepEqual(ran, [CURSOR_COMMANDS.closePromptBar]);
});
