import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ViewerMessage } from '../../src/shared/messages';
import { createOutbox } from '../../src/webview/outbox';

function outbox() {
  const sent: ViewerMessage[] = [];
  const scheduled: (() => void)[] = [];
  const box = createOutbox(message => sent.push(message), flush => scheduled.push(flush));
  const frame = (): void => { for (const flush of scheduled.splice(0)) flush(); };
  return { box, sent, scheduled, frame };
}

const view = (page: number) => ({ page, pageCount: 9, zoomPercent: 100, fit: null, tool: 'text' as const });

test('changes in one frame go out as one patch with the latest of each part', () => {
  const { box, sent, scheduled, frame } = outbox();
  box.loaded();
  box.report({ view: view(1) });
  box.report({ selection: { selection: null } });
  box.report({ view: view(2) });
  assert.equal(sent.length, 0);
  assert.equal(scheduled.length, 1);
  frame();
  assert.deepEqual(sent, [{ type: 'patch', version: 1, load: 1, patch: { view: view(2), selection: { selection: null } } }]);
  frame();
  assert.equal(sent.length, 1);
});

test('a pending patch goes out before any other message, so the selection precedes Copy Link for Agent', () => {
  const { box, sent, frame } = outbox();
  box.loaded();
  const selection = { kind: 'region' as const, page: 1, rect: [1, 2, 3, 4] as [number, number, number, number] };
  box.report({ selection: { selection } });
  box.post({ type: 'copyLinkForAgent' });
  assert.deepEqual(sent.map(message => message.type), ['patch', 'copyLinkForAgent']);
  frame();
  assert.equal(sent.length, 2);
});

test('versions count up for the life of the page, and patches carry the load they belong to', () => {
  const { box, sent, frame } = outbox();
  box.loaded();
  box.report({ view: view(1) });
  frame();
  box.report({ view: view(3) });
  // The file changed: what was pending is sent first, under the old load.
  box.loaded();
  box.report({ outline: [] });
  frame();
  assert.deepEqual(sent.map(message => message.type === 'patch' ? [message.version, message.load] : []), [[1, 1], [2, 1], [3, 2]]);
});
