import assert from 'node:assert/strict';
import { test } from 'node:test';
import './support/install-fake-vscode';
import * as vscode from './support/fake-vscode';
import { AgentHandoff } from '../../src/extension/plugins/agentBridge/handoff';
import {
  MARKDOWN_BRIDGE_ENVELOPE_COMMAND,
  type PdfBridgeEnvelope,
} from '../../src/shared/bridge-envelope';
import {
  PdfEnvelopePublisher,
  type EnvelopeCommandHost,
} from '../../src/extension/plugins/agentBridge/envelope';
import type { PdfPanel } from '../../src/extension/plugins/pdf/panel';
import { parseWorkbenchBridgeEnvelope } from './support/workbench-bridge-parse';

const sourceHash = 'ab'.repeat(32);
const textSelection = {
  kind: 'text' as const,
  text: 'Scaled dot-product attention',
  pages: [{ page: 3, rects: [[72, 83, 150, 95], [72, 95, 206, 104]] as [number, number, number, number][] }],
};

function panel(): PdfPanel {
  const snapshot = {
    selection: textSelection,
    sha256: sourceHash,
    selectedAt: '2026-10-11T12:00:00.000Z',
  };
  return {
    uri: vscode.Uri.file('/work/papers/attention_v2.pdf'),
    viewId: 'pdf:temp-view',
    selectionSnapshot: () => snapshot,
  } as unknown as PdfPanel;
}

test('Copy Link for Agent still writes the source-link clipboard text and does not call the workbench envelope', async () => {
  const calls: string[] = [];
  const clipboard: string[] = [];
  const originalWrite = vscode.env.clipboard.writeText;
  const originalPath = vscode.workspace.asRelativePath;
  const originalExecute = vscode.commands.executeCommand;
  vscode.env.clipboard.writeText = async (text: string) => {
    clipboard.push(text);
  };
  vscode.workspace.asRelativePath = () => 'papers/attention_v2.pdf';
  vscode.commands.executeCommand = async (command: string) => {
    calls.push(command);
    return undefined;
  };
  try {
    const handoff = new AgentHandoff(() => undefined);
    assert.equal(await handoff.copyLinkForAgent(panel()), true);
    assert.equal(clipboard.length, 1);
    assert.ok(clipboard[0]?.startsWith('Source: [papers/attention\\_v2.pdf (page 3)](<papers/attention_v2.pdf#page=3&viewrect=72,83,134,21>)\n'));
    assert.match(clipboard[0] ?? '', new RegExp(`^PDF source SHA-256: \`${sourceHash}\`$`, 'mu'));
    assert.equal(calls.includes(MARKDOWN_BRIDGE_ENVELOPE_COMMAND), false);
    assert.equal(calls.includes('vscodeEmbedPdf.bridge.envelope'), false);
  } finally {
    vscode.env.clipboard.writeText = originalWrite;
    vscode.workspace.asRelativePath = originalPath;
    vscode.commands.executeCommand = originalExecute;
  }
});

test('the handoff builds a Workbench v1 pdf envelope from the pane selection without touching the clipboard', async () => {
  const clipboard: string[] = [];
  const originalWrite = vscode.env.clipboard.writeText;
  const originalPath = vscode.workspace.asRelativePath;
  vscode.env.clipboard.writeText = async (text: string) => {
    clipboard.push(text);
  };
  vscode.workspace.asRelativePath = () => 'papers/attention_v2.pdf';
  try {
    const handoff = new AgentHandoff(() => undefined);
    const envelope = await handoff.envelope(panel());
    assert.equal(clipboard.length, 0);
    assert.equal(envelope?.producer, 'pdf');
    assert.equal(envelope?.view?.id, 'pdf:temp-view');
    assert.equal(envelope?.revision.sourceSha256, sourceHash);
    assert.notEqual(envelope?.selection.sha256, sourceHash);
    assert.equal(envelope?.locator.durable, 'file:///work/papers/attention_v2.pdf#page=3&viewrect=72,83,134,21');
    assert.equal(envelope?.capturedAt, '2026-10-11T12:00:00.000Z');
    assert.equal(envelope?.source.identity, 'papers/attention_v2.pdf');
    assert.equal(envelope?.source.media, 'pdf');
    assert.equal(parseWorkbenchBridgeEnvelope(envelope).ok, true);
  } finally {
    vscode.env.clipboard.writeText = originalWrite;
    vscode.workspace.asRelativePath = originalPath;
  }
});


test('handoff durable locator encodes # in the filename and keeps human identity separate', async () => {
  const originalPath = vscode.workspace.asRelativePath;
  vscode.workspace.asRelativePath = () => 'papers/report#draft.pdf';
  try {
    const snapshot = {
      selection: textSelection,
      sha256: sourceHash,
      selectedAt: '2026-10-11T12:00:00.000Z',
    };
    const hashPanel = {
      uri: vscode.Uri.file('/work/papers/report#draft.pdf'),
      viewId: 'pdf:hash-view',
      selectionSnapshot: () => snapshot,
    } as unknown as PdfPanel;
    const handoff = new AgentHandoff(() => undefined);
    const envelope = await handoff.envelope(hashPanel);
    assert.equal(envelope?.source.identity, 'papers/report#draft.pdf');
    assert.equal(
      envelope?.locator.durable,
      'file:///work/papers/report%23draft.pdf#page=3&viewrect=72,83,134,21',
    );
    assert.equal(envelope?.locator.durable.includes('report#draft'), false);
    assert.equal(parseWorkbenchBridgeEnvelope(envelope).ok, true);
  } finally {
    vscode.workspace.asRelativePath = originalPath;
  }
});

function host(options: {
  noPanel?: boolean;
}): EnvelopeCommandHost {
  return {
    panel: () => (options.noPanel ? undefined : ({} as PdfPanel)),
  };
}

const base: PdfBridgeEnvelope = {
  version: 1,
  producer: 'pdf',
  capturedAt: '2026-10-11T12:00:00.000Z',
  source: { identity: 'papers/attention_v2.pdf', kind: 'file', media: 'pdf' },
  locator: {
    durable: 'papers/attention_v2.pdf#page=3&viewrect=72,83,134,21',
    pdf: { page: 3, viewRect: { x: 72, y: 83, width: 134, height: 21 } },
  },
  view: { id: 'pdf:temp-view' },
  selection: {
    text: 'Scaled dot-product attention',
    sha256: 'cd'.repeat(32),
  },
  revision: { isDirty: false, sourceSha256: sourceHash },
};

function publishingHandoff(envelope: PdfBridgeEnvelope | undefined = base): AgentHandoff {
  return { envelope: async () => envelope } as unknown as AgentHandoff;
}

test('the envelope command returns the pdf envelope and does not call Markdown Workshop', async () => {
  const calls: string[] = [];
  const originalExecute = vscode.commands.executeCommand;
  vscode.commands.executeCommand = async (command: string) => {
    calls.push(command);
    return undefined;
  };
  try {
    const publisher = new PdfEnvelopePublisher(publishingHandoff(), host({}));
    const envelope = await publisher.publish();
    assert.equal(envelope?.producer, 'pdf');
    assert.equal(calls.includes(MARKDOWN_BRIDGE_ENVELOPE_COMMAND), false);
    assert.equal(parseWorkbenchBridgeEnvelope(envelope).ok, true);
  } finally {
    vscode.commands.executeCommand = originalExecute;
  }
});

test('no pdf selection does not invent an envelope', async () => {
  const empty = new PdfEnvelopePublisher(publishingHandoff(undefined), host({ noPanel: true }));
  assert.equal(await empty.publish(), undefined);
});

// Snapshot creation awaits region storage. A selection change during that wait
// must not attach the new selection's timestamp to the old text and file hash.
test('an envelope keeps one selection snapshot when the pane changes during publication', async () => {
  const originalPath = vscode.workspace.asRelativePath;
  vscode.workspace.asRelativePath = () => 'papers/attention_v2.pdf';
  try {
    for (const clear of [false, true]) {
      const original = {
        selection: textSelection,
        sha256: sourceHash,
        selectedAt: '2026-10-11T12:00:00.000Z',
      };
      let current: typeof original | undefined = original;
      const changing = { ...panel(), selectionSnapshot: () => current } as PdfPanel;
      const handoff = new AgentHandoff(() => undefined);
      const pending = handoff.envelope(changing);
      current = clear ? undefined : {
        selection: { ...textSelection, text: 'Another selection' },
        sha256: 'ef'.repeat(32),
        selectedAt: '2026-10-11T12:00:01.000Z',
      };
      const envelope = await pending;
      assert.equal(envelope?.capturedAt, original.selectedAt);
      assert.equal(envelope?.selection.text, original.selection.text);
      assert.equal(envelope?.revision.sourceSha256, original.sha256);
    }
  } finally {
    vscode.workspace.asRelativePath = originalPath;
  }
});
