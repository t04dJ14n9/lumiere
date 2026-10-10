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
    for (const chord of new Set([key, mac ?? key])) { assert.ok(!seen.has(`${chord}|${when}`), `duplicate ${chord}`); seen.add(`${chord}|${when}`); }
  }
  const setting = contributes.configuration.properties['vscodeEmbedPdf.keyboardShortcuts'] as { default: boolean };
  assert.equal(setting.default, true);
});

test('Look Up is a setting, hidden from the palette and offered in the viewer menu only with a word', () => {
  const setting = contributes.configuration.properties['vscodeEmbedPdf.lookUp.enabled'] as { default: boolean };
  assert.equal(setting.default, true);
  const palette = (contributes.menus.commandPalette as { command: string; when?: string }[]).find(entry => entry.command === 'vscodeEmbedPdf.lookUp');
  assert.equal(palette?.when, 'false');
  const menu = (contributes.menus['webview/context'] as { command: string; when?: string }[]).find(entry => entry.command === 'vscodeEmbedPdf.lookUp');
  assert.match(menu?.when ?? '', /vscodeEmbedPdf\.lookUp\.hasWord/u);
});

test('turning the page keeping the place: Option+Arrow on macOS, Ctrl+Alt+Arrow elsewhere, never plain Alt+Arrow (VS Code Go Back/Forward)', () => {
  const bindings = (contributes.keybindings ?? []) as { key: string; mac?: string; command: string }[];
  const keep = bindings.filter(entry => /KeepingPlace$/u.test(entry.command));
  assert.deepEqual(
    keep.map(entry => [entry.command.replace('vscodeEmbedPdf.', ''), entry.key, entry.mac]).sort(),
    [
      ['nextPageKeepingPlace', 'ctrl+alt+down', 'alt+down'],
      ['nextPageKeepingPlace', 'ctrl+alt+right', 'alt+right'],
      ['previousPageKeepingPlace', 'ctrl+alt+left', 'alt+left'],
      ['previousPageKeepingPlace', 'ctrl+alt+up', 'alt+up'],
    ],
  );
  for (const entry of bindings) assert.ok(!/^alt\+(left|right)$/u.test(entry.key), `${entry.command}: ${entry.key} would take VS Code's Go Back/Forward`);
});
