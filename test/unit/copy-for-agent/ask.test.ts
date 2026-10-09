import test from "node:test";
import assert from "node:assert/strict";
import { agentPayload } from "../../../src/plugins/copyForAgent/reference";
import { openAgentChat } from "../../../src/plugins/copyForAgent/chat";

test("the agent payload links the line range and quotes the exact passage", () => {
  assert.equal(
    agentPayload("@Links.md#11-12", "First line\r\n\r\nsecond line\n"),
    "@Links.md#11-12\n\n> First line\n>\n> second line",
  );
});

function host(commands: string[]) {
  const ran: { id: string; args: unknown[] }[] = [];
  const copied: string[] = [];
  return {
    ran,
    copied,
    execute: async (id: string, ...args: unknown[]) => {
      if (!commands.includes(id)) {
        throw new Error(`command '${id}' not found`);
      }
      ran.push({ id, args });
    },
    copy: async (text: string) => {
      copied.push(text);
    },
  };
}

test("VS Code's chat opens first, then gets the passage prefilled with the question left to type", async () => {
  const h = host(["workbench.action.chat.open"]);
  assert.equal(
    await openAgentChat(h.execute, h.copy, "@A.md#1\n\n> a"),
    "chat",
  );
  assert.deepEqual(h.ran, [
    { id: "workbench.action.chat.open", args: [] },
    {
      id: "workbench.action.chat.open",
      args: [{ query: "@A.md#1\n\n> a\n\n", isPartialQuery: true }],
    },
  ]);
  assert.deepEqual(h.copied, []);
});

test("Cursor's agent chat opens with the passage on the clipboard; no chat only copies", async () => {
  const cursor = host(["composer.newAgentChat", "workbench.action.chat.open"]);
  assert.equal(
    await openAgentChat(cursor.execute, cursor.copy, "p"),
    "chatWithClipboard",
  );
  assert.deepEqual(cursor.copied, ["p"]);
  const none = host([]);
  assert.equal(await openAgentChat(none.execute, none.copy, "p"), "clipboard");
  assert.deepEqual(none.copied, ["p"]);
});
