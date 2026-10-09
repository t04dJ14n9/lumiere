import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCurrentPatch, parseViewerMessage } from '../../src/shared/messages';
import { parseStateReport } from './state-report';

test('selections from the viewer are validated, trimmed and sorted', () => {
  assert.deepEqual(parseStateReport({
    type: 'selection',
    selection: { kind: 'text', text: '  two pages  ', pages: [{ page: 5, rects: [[0, 0, 1, 1]] }, { page: 4, rects: [[0, 0, 1, 1]] }] },
  }), {
    type: 'selection',
    selection: { kind: 'text', text: 'two pages', pages: [{ page: 4, rects: [[0, 0, 1, 1]] }, { page: 5, rects: [[0, 0, 1, 1]] }] },
  });
  for (const selection of [
    { kind: 'region', page: 0, rect: [10, 20, 30, 40] },
    { kind: 'region', page: 2, rect: [30, 20, 10, 40] },
    { kind: 'text', text: '   ', pages: [{ page: 1, rects: [[0, 0, 1, 1]] }] },
    { kind: 'text', text: 'x', pages: [] },
    { kind: 'text', text: 'x', pages: [{ page: 1, rects: [[0, 0, 1, 1]] }, { page: 1, rects: [[0, 0, 1, 1]] }] },
    'not an object',
  ]) {
    assert.deepEqual(parseStateReport({ type: 'selection', selection }), { type: 'selection', selection: null });
  }
});

test('a region keeps its text and a PNG snapshot, if the snapshot is a real PNG data URL', () => {
  const region = { kind: 'region', page: 2, rect: [10, 20, 30, 40] };
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(parseStateReport({ type: 'selection', selection: { ...region, text: '  a\nb ' }, image: png }), {
    type: 'selection',
    selection: { ...region, text: 'a\nb' },
    image: png,
  });
  // No text, no text field.
  assert.deepEqual(parseStateReport({ type: 'selection', selection: { ...region, text: ' ' } }), { type: 'selection', selection: region });
  for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,<script>', 'https://example.com/a.png', 42, 'data:image/png;base64,' + 'A'.repeat(8_000_000)]) {
    assert.deepEqual(parseStateReport({ type: 'selection', selection: region, image }), { type: 'selection', selection: region });
  }
  // Only regions carry a snapshot.
  const text = { kind: 'text', text: 'x', pages: [{ page: 1, rects: [[0, 0, 1, 1]] }] };
  assert.deepEqual(parseStateReport({ type: 'selection', selection: text, image: png }), { type: 'selection', selection: text });
});

test('outlines are cleaned: titles collapsed, bad pages dropped, nesting kept', () => {
  assert.deepEqual(parseStateReport({
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

test('an outline entry keeps how far down its page it opens, if that is a real offset', () => {
  const item = (top: unknown, page: unknown = 9) => ({ title: 'Section', page, top, children: [] });
  assert.deepEqual(parseStateReport({ type: 'outline', items: [item(130.5)] }), {
    type: 'outline',
    items: [{ title: 'Section', page: 9, top: 130.5, children: [] }],
  });
  for (const top of [0, -5, Number.NaN, Infinity, '130', 2e6]) {
    assert.deepEqual(parseStateReport({ type: 'outline', items: [item(top)] }), {
      type: 'outline',
      items: [{ title: 'Section', page: 9, children: [] }],
    });
  }
  // No page, no offset.
  assert.deepEqual(parseStateReport({ type: 'outline', items: [item(130, 0)] }), {
    type: 'outline',
    items: [{ title: 'Section', children: [] }],
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
  // Copy for Agent was removed (Copy Link for Agent copies too; Cmd/Ctrl+C copies plain text).
  assert.equal(parseViewerMessage({ type: 'copyForAgent' }), undefined);
  assert.equal(parseViewerMessage({ type: 'askAgent' }), undefined);
  assert.deepEqual(parseViewerMessage({ type: 'copyLinkForAgent', query: 'ignored' }), { type: 'copyLinkForAgent' });
  assert.deepEqual(parseViewerMessage({ type: 'toggleOutline', open: 'ignored' }), { type: 'toggleOutline' });
  assert.deepEqual(parseViewerMessage({ type: 'floatingDock', dock: 'right' }), { type: 'floatingDock', dock: 'right' });
  assert.equal(parseViewerMessage({ type: 'floatingDock', dock: 'center' }), undefined);
  assert.equal(parseViewerMessage({ type: 'floatingDock' }), undefined);
});

test('state patches need a version from 1 and a load count, and keep only valid parts', () => {
  const view = { page: 2, pageCount: 3, zoomPercent: 100, fit: null, tool: 'text' };
  assert.deepEqual(parseViewerMessage({ type: 'patch', version: 3, load: 1, patch: { view, extra: 1 } }), {
    type: 'patch', version: 3, load: 1, patch: { view },
  });
  assert.deepEqual(parseViewerMessage({ type: 'patch', version: 1, load: 0, patch: {} }), { type: 'patch', version: 1, load: 0, patch: {} });
  for (const [version, load] of [[0, 1], [1.5, 1], ['2', 1], [1, -1], [1, 0.5], [undefined, 1], [1, undefined]]) {
    assert.equal(parseViewerMessage({ type: 'patch', version, load, patch: {} }), undefined, `${version} ${load}`);
  }
  assert.equal(parseViewerMessage({ type: 'patch', version: 1, load: 1, patch: null }), undefined);
  // A malformed view rejects the patch; a malformed selection reads as none.
  assert.equal(parseViewerMessage({ type: 'patch', version: 1, load: 1, patch: { view: { page: 9 } } }), undefined);
  assert.deepEqual(parseViewerMessage({ type: 'patch', version: 1, load: 1, patch: { selection: { selection: 'x' } } }), {
    type: 'patch', version: 1, load: 1, patch: { selection: { selection: null } },
  });
  // The old one-part messages are gone.
  assert.equal(parseViewerMessage({ type: 'view', view }), undefined);
  assert.equal(parseViewerMessage({ type: 'selection', selection: null }), undefined);
  assert.equal(parseViewerMessage({ type: 'outline', items: [] }), undefined);
});

test('the host applies only newer patches about the bytes it sent last', () => {
  assert.equal(isCurrentPatch({ version: 5, load: 2 }, 4, 2), true);
  // Out of order, or repeated.
  assert.equal(isCurrentPatch({ version: 4, load: 2 }, 4, 2), false);
  assert.equal(isCurrentPatch({ version: 3, load: 2 }, 4, 2), false);
  // Reported before the viewer had the latest bytes.
  assert.equal(isCurrentPatch({ version: 5, load: 1 }, 4, 2), false);
});
