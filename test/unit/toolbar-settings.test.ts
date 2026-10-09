import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseToolbarMode, showStatusBarButtons, titleActionsInMenu } from '../../src/shared/toolbar-settings';

test('the toolbar mode defaults to VS Code\'s own controls', () => {
  for (const mode of ['chrome', 'slim', 'none'] as const) assert.equal(parseToolbarMode(mode), mode);
  for (const value of [undefined, null, '', 'Slim', 'compact', 42]) assert.equal(parseToolbarMode(value), 'chrome');
});

test('status bar buttons show in Cursor unless set otherwise', () => {
  assert.equal(showStatusBarButtons('auto', 'Cursor'), true);
  assert.equal(showStatusBarButtons('auto', 'Visual Studio Code'), false);
  assert.equal(showStatusBarButtons(undefined, 'Cursor'), true);
  assert.equal(showStatusBarButtons('always', 'Visual Studio Code'), true);
  assert.equal(showStatusBarButtons('never', 'Cursor'), false);
});

test('Cursor keeps extension title actions in its "…" menu', () => {
  assert.equal(titleActionsInMenu('Cursor'), true);
  assert.equal(titleActionsInMenu('Visual Studio Code'), false);
  assert.equal(titleActionsInMenu('Visual Studio Code - Insiders'), false);
});
