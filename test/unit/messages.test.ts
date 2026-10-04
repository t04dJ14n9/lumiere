import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseViewerMessage } from '../../src/shared/messages';

test('selections from the viewer are validated', () => {
  assert.deepEqual(parseViewerMessage({
    type: 'selection',
    selection: { kind: 'region', page: 2, rect: [10, 20, 30, 40] },
  }), { type: 'selection', selection: { kind: 'region', page: 2, rect: [10, 20, 30, 40] } });
  for (const selection of [
    { kind: 'region', page: 0, rect: [10, 20, 30, 40] },
    { kind: 'region', page: 2, rect: [30, 20, 10, 40] },
    { kind: 'text', text: '   ', pages: [{ page: 1, rects: [[0, 0, 1, 1]] }] },
    { kind: 'text', text: 'x', pages: [] },
    { kind: 'text', text: 'x', pages: [{ page: 1, rects: [[0, 0, 1, 1]] }, { page: 1, rects: [[0, 0, 1, 1]] }] },
    'not an object',
  ]) {
    assert.deepEqual(parseViewerMessage({ type: 'selection', selection }), { type: 'selection', selection: null });
  }
});

test('text selections are trimmed and their pages sorted', () => {
  const message = parseViewerMessage({
    type: 'selection',
    selection: { kind: 'text', text: '  two pages  ', pages: [{ page: 5, rects: [[0, 0, 1, 1]] }, { page: 4, rects: [[0, 0, 1, 1]] }] },
  });
  assert.deepEqual(message, {
    type: 'selection',
    selection: { kind: 'text', text: 'two pages', pages: [{ page: 4, rects: [[0, 0, 1, 1]] }, { page: 5, rects: [[0, 0, 1, 1]] }] },
  });
});

test('outlines are cleaned: titles collapsed, bad pages dropped, nesting kept', () => {
  assert.deepEqual(parseViewerMessage({
    type: 'outline',
    items: [
      { title: '  Part \n One ', page: 1, children: [{ title: 'Section', page: 'two', children: [] }] },
      { title: 42, page: 3, children: [] },
      { title: '', children: 'none' },
    ],
  }), {
    type: 'outline',
    items: [
      { title: 'Part One', page: 1, children: [{ title: 'Section', children: [] }] },
      { title: 'Untitled', children: [] },
    ],
  });
});

test('only web and mail links may be opened from a PDF', () => {
  assert.deepEqual(parseViewerMessage({ type: 'openExternal', url: 'https://example.com/a b' }), undefined);
  assert.deepEqual(parseViewerMessage({ type: 'openExternal', url: 'https://example.com/paper' }), {
    type: 'openExternal',
    url: 'https://example.com/paper',
  });
  assert.ok(parseViewerMessage({ type: 'openExternal', url: 'mailto:author@example.com' }));
  for (const url of ['file:///etc/passwd', 'command:workbench.action.quit', 'javascript:alert(1)', 'vscode://x']) {
    assert.equal(parseViewerMessage({ type: 'openExternal', url }), undefined);
  }
});

test('unknown messages are ignored', () => {
  assert.equal(parseViewerMessage({ type: 'eval', code: '1' }), undefined);
  assert.equal(parseViewerMessage(null), undefined);
  assert.deepEqual(parseViewerMessage({ type: 'copyForAgent', extra: 'ignored' }), { type: 'copyForAgent' });
});
