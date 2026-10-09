import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

interface Contributes {
  commands: { command: string; title: string }[];
  configuration: { properties: Record<string, unknown> };
  menus: Record<string, { command: string }[]>;
  keybindings?: { command: string }[];
}

const { contributes } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { contributes: Contributes };

test('Copy Link for Agent is the only agent command; Copy for Agent and Ask Agent are gone', () => {
  const commands = contributes.commands.map(entry => entry.command);
  assert.ok(commands.includes('vscodeEmbedPdf.copyLinkForAgent'));
  assert.ok(!commands.includes('vscodeEmbedPdf.copyForAgent'));
  for (const [menu, entries] of Object.entries(contributes.menus)) {
    assert.ok(!entries.some(entry => entry.command === 'vscodeEmbedPdf.copyForAgent'), menu);
  }
  for (const menu of ['editor/title', 'webview/context', 'commandPalette']) {
    assert.ok(contributes.menus[menu]?.some(entry => entry.command === 'vscodeEmbedPdf.copyLinkForAgent'), menu);
  }
  assert.ok(!(contributes.keybindings ?? []).some(entry => entry.command === 'vscodeEmbedPdf.copyForAgent'));
  // Ask Agent was renamed Copy Link for Agent, with no leftover id, title or setting.
  assert.deepEqual(contributes.commands.filter(entry => /agent/iu.test(entry.command)).map(entry => entry.title), ['Copy Link for Agent']);
  assert.ok(!JSON.stringify(contributes).includes('askAgent'));
  assert.ok('vscodeEmbedPdf.copyLinkForAgent.target' in contributes.configuration.properties);
});
