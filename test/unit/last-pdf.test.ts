import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { LastPdf } from '../../src/extension/plugins/agentBridge/last-pdf';
import type { PdfPanel } from '../../src/extension/plugins/pdf/panel';
import type { PdfPanels } from '../../src/extension/plugins/pdf/panels';
import type { PdfSelection } from '../../src/shared/selection';

const selection: PdfSelection = {
  kind: 'text',
  text: 'selected',
  pages: [{ page: 1, rects: [[1, 2, 3, 4]] }],
};

function makePanel(id: string, hasSelection = true): PdfPanel {
  return {
    viewId: id,
    selection: hasSelection ? selection : undefined,
  } as unknown as PdfPanel;
}

function makePanels(): PdfPanels & {
  setActive(panel: PdfPanel | undefined): void;
  setAll(panels: readonly PdfPanel[]): void;
  fire(): void;
} {
  const changed = new EventEmitter();
  let active: PdfPanel | undefined;
  let all: PdfPanel[] = [];
  return {
    get active() {
      return active;
    },
    get all() {
      return all;
    },
    onDidChange: (listener: () => void) => {
      changed.on('change', listener);
      return { dispose: () => changed.off('change', listener) };
    },
    setActive(panel: PdfPanel | undefined) {
      active = panel;
    },
    setAll(next: readonly PdfPanel[]) {
      all = [...next];
    },
    fire() {
      changed.emit('change');
    },
  } as unknown as PdfPanels & {
    setActive(panel: PdfPanel | undefined): void;
    setAll(panels: readonly PdfPanel[]): void;
    fire(): void;
  };
}

test('closing the most recent PDF falls back to the newest still-open pane', () => {
  const panels = makePanels();
  const last = new LastPdf(panels);
  const a = makePanel('pdf:a');
  const c = makePanel('pdf:c');
  const b = makePanel('pdf:b');

  // Open/select A, then C, then B (insertion order A, C, B — same trap as PdfPanels.all).
  panels.setAll([a, c, b]);
  panels.setActive(a);
  panels.fire();
  panels.setActive(c);
  panels.fire();
  panels.setActive(b);
  panels.fire();

  // Switch to a non-PDF editor and close B.
  panels.setActive(undefined);
  panels.setAll([a, c]);
  panels.fire();

  assert.equal(last.panel, c, 'must prefer C (newer) over A (older insertion-order hit)');
  last.dispose();
});

test('active PDF always wins; without active, return the newest pane even when it has no selection', () => {
  const panels = makePanels();
  const last = new LastPdf(panels);
  const withSel = makePanel('pdf:sel');
  const bare = makePanel('pdf:bare', false);

  panels.setAll([withSel, bare]);
  panels.setActive(withSel);
  panels.fire();
  panels.setActive(bare);
  panels.fire();
  assert.equal(last.panel, bare, 'active panel wins even without a selection');

  panels.setActive(undefined);
  panels.fire();
  // Do not skip bare and leak withSel's selection: the last-looked-at PDF is bare.
  // AgentHandoff.envelope() returns undefined when bare has no selection.
  assert.equal(last.panel, bare, 'return newest still-open pane even without a selection');
  last.dispose();
});

test('PDF already active when LastPdf is constructed is remembered after focus leaves', () => {
  const panels = makePanels();
  const a = makePanel('pdf:a');
  panels.setAll([a]);
  panels.setActive(a);
  // MCP start / late tracker: no onDidChange while A is active.
  const last = new LastPdf(panels);
  assert.equal(last.panel, a, 'constructor must seed panels.active');

  panels.setActive(undefined);
  panels.fire();
  assert.equal(last.panel, a, 'after focus leaves, still the seeded PDF');
  last.dispose();
});

test('a shared LastPdf instance keeps history across a late MCP-style consumer', () => {
  const panels = makePanels();
  const a = makePanel('pdf:a');
  // Plugin-owned tracker runs while the PDF is focused.
  const shared = new LastPdf(panels);
  panels.setAll([a]);
  panels.setActive(a);
  panels.fire();
  // Focus leaves before MCP would have started; the shared instance still knows A.
  panels.setActive(undefined);
  panels.fire();
  assert.equal(shared.panel, a);
  // A second consumer must reuse the same instance — a fresh tracker would be empty.
  const late = new LastPdf(panels);
  assert.equal(late.panel, undefined, 'fresh tracker after focus left has no history');
  assert.equal(shared.panel, a, 'plugin-owned tracker still resolves the PDF');
  shared.dispose();
  late.dispose();
});
