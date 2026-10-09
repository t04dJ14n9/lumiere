import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

interface Contributes {
  commands: { command: string }[];
  menus: Record<string, { command: string }[]>;
  keybindings?: { command: string }[];
}

const { contributes } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { contributes: Contributes };

test('Ask Agent is the only agent command; Copy for Agent is gone from every menu', () => {
  const commands = contributes.commands.map(entry => entry.command);
  assert.ok(commands.includes('vscodeEmbedPdf.askAgent'));
  assert.ok(!commands.includes('vscodeEmbedPdf.copyForAgent'));
  for (const [menu, entries] of Object.entries(contributes.menus)) {
    assert.ok(!entries.some(entry => entry.command === 'vscodeEmbedPdf.copyForAgent'), menu);
  }
  for (const menu of ['editor/title', 'webview/context', 'commandPalette']) {
    assert.ok(contributes.menus[menu]?.some(entry => entry.command === 'vscodeEmbedPdf.askAgent'), menu);
  }
  assert.ok(!(contributes.keybindings ?? []).some(entry => entry.command === 'vscodeEmbedPdf.copyForAgent'));
});
