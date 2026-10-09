import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestDock, parseToolbarMode, parseToolbarSettings, showStatusBarButtons, titleActionsInMenu } from '../../src/shared/toolbar-settings';

test('the toolbar mode defaults to VS Code\'s own controls', () => {
  for (const mode of ['chrome', 'slim', 'floating', 'none'] as const) assert.equal(parseToolbarMode(mode), mode);
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

test('toolbar settings from a message fall back to the defaults', () => {
  assert.deepEqual(parseToolbarSettings({ mode: 'floating', dock: 'left' }), { mode: 'floating', dock: 'left' });
  assert.deepEqual(parseToolbarSettings({ mode: 'slim' }), { mode: 'slim', dock: 'bottom' });
  assert.deepEqual(parseToolbarSettings({ mode: 'floating', dock: 'middle' }), { mode: 'floating', dock: 'bottom' });
  for (const value of [undefined, null, 'slim', 3]) assert.deepEqual(parseToolbarSettings(value), { mode: 'chrome', dock: 'bottom' });
});

test('a dropped floating bar docks to the nearest edge', () => {
  // A 1000 x 600 viewer.
  assert.equal(nearestDock(500, 20, 1000, 600), 'top');
  assert.equal(nearestDock(500, 590, 1000, 600), 'bottom');
  assert.equal(nearestDock(10, 300, 1000, 600), 'left');
  assert.equal(nearestDock(980, 300, 1000, 600), 'right');
  // Nearest in pixels: near the middle of a wide viewer, the top or bottom.
  assert.equal(nearestDock(400, 280, 1000, 600), 'top');
  assert.equal(nearestDock(400, 320, 1000, 600), 'bottom');
  assert.equal(nearestDock(150, 300, 1000, 600), 'left');
});
