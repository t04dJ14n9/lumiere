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

function environment(commands: string[], hasChatParticipant = false) {
  return {
    commands: new Set(commands),
    hasChatParticipant,
    chatDisabled: false,
  };
}

test("VS Code's own chat is skipped when no extension answers there; Claude Code gets the passage as its prompt", async () => {
  const commands = ["workbench.action.chat.open", "claude-vscode.editor.open"];
  const h = host(commands);
  assert.equal(
    await openAgentChat(h.execute, h.copy, "@A.md#1-2\n\n> a", {
      environment: environment(commands),
    }),
    "claudeCode",
  );
  assert.deepEqual(h.ran, [
    {
      id: "claude-vscode.editor.open",
      args: [undefined, "@A.md#1-2\n\n> a\n\n"],
    },
  ]);
  assert.deepEqual(h.copied, []);
});

test("VS Code's chat still comes first when a chat extension answers there", async () => {
  const commands = ["workbench.action.chat.open", "claude-vscode.editor.open"];
  const h = host(commands);
  assert.equal(
    await openAgentChat(h.execute, h.copy, "p", {
      environment: environment(commands, true),
    }),
    "chat",
  );
});

test("Codex gets the passage attached as a file, and copied", async () => {
  const commands = [
    "workbench.action.chat.open",
    "chatgpt.openSidebar",
    "chatgpt.addFileToThread",
  ];
  const h = host(commands);
  const written: string[] = [];
  assert.equal(
    await openAgentChat(h.execute, h.copy, "@A.md#1\n\n> a", {
      environment: environment(commands),
      writeScratchFile: async (text) => {
        written.push(text);
        return "file:///tmp/markdown-workbench-agent/A.md-1.md";
      },
      codexRetryDelaysMs: [0],
    }),
    "codex",
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(written, ["@A.md#1\n\n> a"]);
  assert.deepEqual(h.copied, ["@A.md#1\n\n> a"]);
  assert.deepEqual(h.ran, [
    { id: "chatgpt.openSidebar", args: [] },
    {
      id: "chatgpt.addFileToThread",
      args: ["file:///tmp/markdown-workbench-agent/A.md-1.md"],
    },
    // Repeated for a Codex view that was still loading (Codex adds a file once).
    {
      id: "chatgpt.addFileToThread",
      args: ["file:///tmp/markdown-workbench-agent/A.md-1.md"],
    },
  ]);
});

test("with no agent but VS Code's empty chat, the passage is only copied", async () => {
  const commands = ["workbench.action.chat.open"];
  const h = host(commands);
  assert.equal(
    await openAgentChat(h.execute, h.copy, "p", {
      environment: environment(commands),
    }),
    "clipboard",
  );
  assert.deepEqual(h.ran, []);
  assert.deepEqual(h.copied, ["p"]);
});

test("scratch file names keep the note name and line range", async () => {
  const { scratchName } = await import(
    "../../../src/plugins/copyForAgent/agent"
  );
  assert.equal(
    scratchName("@notes/Transformer.md#5-6"),
    "Transformer.md-5-6.md",
  );
  assert.equal(scratchName("@file:///C:/My%20Notes/a.md#3"), "a.md-3.md");
});

test("the Codex attachment names the note's file, since it lives outside the workspace", async () => {
  const { scratchText } = await import(
    "../../../src/plugins/copyForAgent/agent"
  );
  assert.equal(
    scratchText("@notes/a.md#5-6\n\n> x", {
      text: "@notes/a.md#5-6",
      uri: "file:///w/notes/a.md",
      startLine: 5,
      endLine: 6,
    }),
    "@notes/a.md#5-6\n\n> x\n\nNote file: file:///w/notes/a.md (lines 5-6)\n",
  );
});
