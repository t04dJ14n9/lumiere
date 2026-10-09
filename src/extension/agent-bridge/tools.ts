/**
 * The MCP tools the agent bridge serves. They read live editor state, so
 * every MCP client (Cursor, Claude Code, Codex, VS Code chat) sees the
 * selection the user has right now, without the clipboard.
 */
import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PdfPanel } from '../pdf-panel';
import type { PdfPanels } from '../pdf-panels';

export const MARKDOWN_WORKBENCH_ID = 't04dj14n9.vscode-markdown-workbench';

/**
 * Remembers the PDF editor the user last looked at. When they switch to an
 * agent's chat to ask about it, no PDF is the active tab any more.
 */
export class LastPdf implements vscode.Disposable {
  private last: PdfPanel | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly panels: PdfPanels) {
    this.subscription = panels.onDidChange(() => {
      if (panels.active) this.last = panels.active;
    });
  }

  get panel(): PdfPanel | undefined {
    if (this.panels.active) return this.panels.active;
    if (this.last && this.panels.all.includes(this.last)) return this.last;
    return this.panels.all.find(panel => panel.selection);
  }

  dispose(): void {
    this.subscription.dispose();
  }
}

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/** A fresh server for one request (the bridge is stateless). */
export function createBridgeServer(lastPdf: LastPdf): McpServer {
  const server = new McpServer({ name: 'agent-pdf-viewer', version: '0.1.0' });

  server.registerTool('get_current_pdf_selection', {
    title: 'Current PDF selection',
    description:
      'The text or region the user has selected in the PDF open in their editor (Agent PDF Viewer): ' +
      'the quoted text, a link to the page and box (path#page=N&viewrect=left,top,width,height, RFC 8118), ' +
      'the file\'s SHA-256 and, for a region, a PNG snapshot. Call this when the user refers to ' +
      '"this", "the selection", "the highlighted passage", "this figure", or similar in a PDF.',
    inputSchema: {
      includeImage: z.boolean().optional().describe('Include a region\'s PNG snapshot as an image (default true).'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ includeImage }) => {
    const panel = lastPdf.panel;
    const snapshot = await panel?.agentSnapshot();
    if (!snapshot) {
      return {
        content: [{ type: 'text', text: panel
          ? `No selection in ${vscode.workspace.asRelativePath(panel.uri, false)}. Ask the user to select text or drag a region in the PDF.`
          : 'No PDF is open in Agent PDF Viewer.' }],
      };
    }
    const content: Content[] = [{ type: 'text', text: snapshot.agentText }];
    if (snapshot.regionImage && includeImage !== false) {
      const png = await readFile(snapshot.regionImage).catch(() => undefined);
      if (png) content.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
    }
    content.push({ type: 'text', text: JSON.stringify({
      file: snapshot.file, uri: snapshot.uri, sha256: snapshot.sha256, kind: snapshot.selection.kind,
      ...(snapshot.regionImage ? { regionImage: snapshot.regionImage } : {}),
    }) });
    return { content };
  });

  server.registerTool('open_pdf_location', {
    title: 'Open PDF at location',
    description:
      'Open a PDF in the user\'s editor at a page and box, to show them a citation. Accepts a link such as ' +
      '"papers/paper.pdf#page=3&viewrect=72,83,134,21" (workspace-relative or absolute path), or a Markdown link to one.',
    inputSchema: { link: z.string().min(1).describe('PDF path with optional #page=…&viewrect=… fragment.') },
  }, async ({ link }) => {
    const opened = await vscode.commands.executeCommand<boolean>('vscodeEmbedPdf.openLocation', link);
    return { content: [{ type: 'text', text: opened ? `Opened ${link}` : `Could not open ${link}: no such PDF.` }], isError: !opened };
  });

  server.registerTool('get_current_note_selection', {
    title: 'Current Markdown note selection',
    description:
      'The text the user has selected in the Markdown note open in Markdown Workbench, with an ' +
      '@path#start-end line reference. Call this when the user refers to the selection in their note.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ({ content: [{ type: 'text', text: await noteSelection() }] }));

  return server;
}

interface WorkbenchApi {
  getEditors(): readonly { editorId: string; uri: vscode.Uri; isActive: boolean; isDirty: boolean }[];
  getSelection(editorId: string): Promise<{ text: string; startLine: number; endLine: number; isDirty: boolean } | undefined>;
  createAgentReference(selection: unknown): Promise<{ text: string }>;
}

async function noteSelection(): Promise<string> {
  const extension = vscode.extensions.getExtension<WorkbenchApi>(MARKDOWN_WORKBENCH_ID);
  if (!extension) return 'Markdown Workbench is not installed.';
  const api = extension.isActive ? extension.exports : await extension.activate();
  const editors = api?.getEditors?.() ?? [];
  // Prefer the active editor, then any editor with a non-empty selection.
  const ordered = [...editors].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  for (const editor of ordered) {
    const selection = await api.getSelection(editor.editorId).catch(() => undefined);
    if (!selection || !selection.text) continue;
    const path = vscode.workspace.asRelativePath(editor.uri, false);
    let reference: string;
    try {
      reference = (await api.createAgentReference(selection)).text;
    } catch {
      // Unsaved notes have no stable line reference.
      reference = `${path} (unsaved, lines ${selection.startLine}-${selection.endLine})`;
    }
    return [`Source: ${reference}`, '', 'Selected text:', selection.text].join('\n');
  }
  return editors.length ? 'No text is selected in the open Markdown Workbench notes.' : 'No note is open in Markdown Workbench.';
}
