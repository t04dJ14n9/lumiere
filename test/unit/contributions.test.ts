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

test('every default shortcut is scoped to the PDF viewer, to non-input focus and to the opt-out setting', () => {
  const bindings = (contributes.keybindings ?? []) as { key: string; mac?: string; command: string; when?: string }[];
  assert.ok(bindings.length > 0);
  const seen = new Set<string>();
  for (const { key, mac, command, when } of bindings) {
    assert.ok(command.startsWith('vscodeEmbedPdf.'), command);
    for (const clause of [
      "activeCustomEditorId == 'vscodeEmbedPdf.viewer'",
      '!inputFocus',
      '!sideBarFocus',
      '!panelFocus',
      '!auxiliaryBarFocus',
      'config.vscodeEmbedPdf.keyboardShortcuts',
    ]) {
      assert.ok(when?.includes(clause), `${command} (${key}) lacks ${clause}`);
    }
    // No two of our own bindings share a key under the same condition.
    for (const chord of [key, mac ?? key]) { assert.ok(!seen.has(`${chord}|${when}`), `duplicate ${chord}`); seen.add(`${chord}|${when}`); }
  }
  const setting = contributes.configuration.properties['vscodeEmbedPdf.keyboardShortcuts'] as { default: boolean };
  assert.equal(setting.default, true);
});
