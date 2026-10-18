import assert from "node:assert/strict";
import { test } from "node:test";
// First: everything below imports 'vscode', which this points at the fake.
import "./support/install-fake-vscode";
import * as vscode from "./support/fake-vscode";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBridgeServer } from "../../src/extension/plugins/agentBridge/mcp/tools";
import { LastPdf } from "../../src/extension/plugins/agentBridge/last-pdf";
import type { AgentHandoff } from "../../src/extension/plugins/agentBridge/handoff";
import type {
  NoteSelection,
  NoteSelections,
} from "../../src/extension/plugins/agentBridge/note-selections";
import type { PdfPanels } from "../../src/extension/plugins/pdf/panels";

const noEvent = () => ({ dispose() {} });
const panels = {
  all: [],
  active: undefined,
  onDidChange: noEvent,
  onDidOpen: noEvent,
} as unknown as PdfPanels;

/** What get_current_note_selection answers, through a real MCP client. */
async function noteSelectionText(notes?: NoteSelections): Promise<string> {
  const server = createBridgeServer(
    new LastPdf(panels),
    {} as AgentHandoff,
    notes,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const result = (await client.callTool({
      name: "get_current_note_selection",
      arguments: {},
    })) as { content: { type: string; text: string }[] };
    return result.content[0]!.text;
  } finally {
    await client.close();
    await server.close();
  }
}

const notes = (
  selection: NoteSelection | undefined,
  open = true,
): NoteSelections => ({
  hasOpenNotes: () => open,
  current: async () => selection,
});

test("the note selection comes from Lumière in the same extension", async () => {
  const text = await noteSelectionText(
    notes({
      uri: vscode.Uri.parse("untitled:Draft.md") as never,
      text: "the quoted passage",
      startLine: 3,
      endLine: 4,
      isDirty: false,
    }),
  );
  assert.match(text, /#3-4/u);
  assert.match(text, /the quoted passage/u);
});

test("without a selection, an open note or Lumière, the tool says which", async () => {
  assert.match(
    await noteSelectionText(notes(undefined)),
    /No text is selected/u,
  );
  assert.match(
    await noteSelectionText(notes(undefined, false)),
    /No note is open/u,
  );
  assert.match(await noteSelectionText(), /not running/u);
});
