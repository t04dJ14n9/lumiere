/**
 * The MCP tools the agent bridge serves. They read live editor state, so
 * every MCP client (Cursor, Claude Code, Codex, VS Code chat) sees the
 * selection the user has right now, without the clipboard.
 */
import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { notePayload, noteReference } from "@workshop/agents/handoff";
import { OPEN_LOCATION_COMMAND_ID } from "../../pdf/registered-commands";
import type { AgentHandoff } from "../handoff";
import type { NoteSelections } from "../note-selections";
import { LastPdf } from "../last-pdf";

export { LastPdf };

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** A fresh server for one request (the bridge is stateless). */
export function createBridgeServer(
  lastPdf: LastPdf,
  handoff: AgentHandoff,
  notes?: NoteSelections,
): McpServer {
  const server = new McpServer({ name: "agent-pdf-viewer", version: "0.1.0" });
  registerPdfSelection(server, lastPdf, handoff);
  registerOpenLocation(server);
  registerNoteSelection(server, notes);
  return server;
}

function registerPdfSelection(
  server: McpServer,
  lastPdf: LastPdf,
  handoff: AgentHandoff,
): void {
  server.registerTool(
    "get_current_pdf_selection",
    {
      title: "Current PDF selection",
      description:
        "The text or region the user has selected in the PDF open in their editor (PDF Workshop): " +
        "a short Markdown link (basename · p.N → path#page=N&viewrect=…, RFC 8118) plus a blockquote " +
        "of the selected text, and for a region a PNG snapshot. Call this when the user refers to " +
        '"this", "the selection", "the highlighted passage", "this figure", or similar in a PDF.',
      inputSchema: {
        includeImage: z
          .boolean()
          .optional()
          .describe(
            "Include a region's PNG snapshot as an image (default true).",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ includeImage }) => ({
      content: await pdfSelection(lastPdf, handoff, includeImage !== false),
    }),
  );
}

/** The selection's agent text, a region's snapshot, and its facts as JSON. */
async function pdfSelection(
  lastPdf: LastPdf,
  handoff: AgentHandoff,
  includeImage: boolean,
): Promise<Content[]> {
  const panel = lastPdf.panel;
  const snapshot = panel && (await handoff.snapshot(panel));
  if (!snapshot) {
    const text = panel
      ? `No selection in ${vscode.workspace.asRelativePath(panel.uri, false)}. Ask the user to select text or drag a region in the PDF.`
      : "No PDF is open in PDF Workshop.";
    return [{ type: "text", text }];
  }
  const content: Content[] = [{ type: "text", text: snapshot.agentText }];
  const png =
    snapshot.regionImage && includeImage
      ? await readFile(snapshot.regionImage).catch(() => undefined)
      : undefined;
  if (png) {
    content.push({
      type: "image",
      data: png.toString("base64"),
      mimeType: "image/png",
    });
  }
  content.push({
    type: "text",
    text: JSON.stringify({
      file: snapshot.file,
      uri: snapshot.uri,
      sha256: snapshot.sha256,
      kind: snapshot.selection.kind,
      ...(snapshot.regionImage ? { regionImage: snapshot.regionImage } : {}),
    }),
  });
  return content;
}

function registerOpenLocation(server: McpServer): void {
  server.registerTool(
    "open_pdf_location",
    {
      title: "Open PDF at location",
      description:
        "Open a PDF in the user's editor at a page and box, to show them a citation. Accepts a link such as " +
        '"papers/paper.pdf#page=3&viewrect=72,83,134,21" (workspace-relative or absolute path), or a Markdown link to one.',
      inputSchema: {
        link: z
          .string()
          .min(1)
          .describe("PDF path with optional #page=…&viewrect=… fragment."),
      },
    },
    async ({ link }) => {
      const opened = await vscode.commands.executeCommand<boolean>(
        OPEN_LOCATION_COMMAND_ID,
        link,
      );
      const text = opened
        ? `Opened ${link}`
        : `Could not open ${link}: no such PDF.`;
      return { content: [{ type: "text", text }], isError: !opened };
    },
  );
}

function registerNoteSelection(
  server: McpServer,
  notes: NoteSelections | undefined,
): void {
  server.registerTool(
    "get_current_note_selection",
    {
      title: "Current Markdown note selection",
      description:
        "The text the user has selected in the Markdown note open in Markdown Workshop, with an " +
        "@path#start-end line reference. Call this when the user refers to the selection in their note.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [{ type: "text", text: await noteSelection(notes) }],
    }),
  );
}

/** The note selection as Copy Link for Agent writes it, or why there is none. */
async function noteSelection(
  notes: NoteSelections | undefined,
): Promise<string> {
  if (!notes) {
    return "Markdown Workshop is not running.";
  }
  const selection = await notes.current();
  if (!selection) {
    return notes.hasOpenNotes()
      ? "No text is selected in the open Markdown Workshop notes."
      : "No note is open in Markdown Workshop.";
  }
  const { uri } = selection;
  const relative = vscode.workspace.asRelativePath(uri, false);
  const inWorkspace =
    uri.scheme === "file" &&
    relative !== uri.fsPath &&
    (vscode.workspace.workspaceFolders?.length ?? 0) === 1;
  // Unsaved notes have no stable line reference.
  const reference = noteReference(
    inWorkspace ? relative : uri.toString(),
    selection.startLine,
    selection.endLine,
    selection.isDirty,
  );
  return notePayload(reference, selection.text);
}
