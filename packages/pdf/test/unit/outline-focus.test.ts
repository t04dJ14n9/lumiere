import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOutlineFocus,
  LEAVE_RESTORE_MS,
  MARKDOWN_WORKSHOP_EDITOR,
  NATIVE_OUTLINE_ID,
  PDF_OUTLINE_VIEW_ID,
} from '../../src/extension/plugins/pdfOutline/focus';

test('entering a PDF Workshop editor hides native Outline and shows PDF Outline', async () => {
  const executed: string[] = [];
  const focus = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    schedule: () => ({ dispose() {} }),
  });
  focus.sync(true);
  await settle();
  assert.deepEqual(executed, [
    `${NATIVE_OUTLINE_ID}.removeView`,
    `${PDF_OUTLINE_VIEW_ID}.focus`,
    'focusEditor',
  ]);
  executed.length = 0;
  focus.sync(true);
  await settle();
  assert.deepEqual(executed, []);
  focus.dispose();
  await settle();
});

test('leaving restores native Outline after the debounce window', async () => {
  const executed: string[] = [];
  let pending: (() => void) | undefined;
  const focus = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    activeCustomEditorViewType: () => undefined,
    leaveDelayMs: LEAVE_RESTORE_MS,
    schedule: run => {
      pending = run;
      return { dispose() { pending = undefined; } };
    },
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.sync(false);
  assert.equal(typeof pending, 'function');
  assert.deepEqual(executed, []);
  pending!();
  await settle();
  assert.deepEqual(executed, [`${NATIVE_OUTLINE_ID}.focus`, 'focusEditor']);
  focus.dispose();
  await settle();
});

test('a quick re-enter cancels the pending native Outline restore', async () => {
  const executed: string[] = [];
  let pending: (() => void) | undefined;
  const focus = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    schedule: run => {
      pending = run;
      return { dispose() { pending = undefined; } };
    },
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.sync(false);
  focus.sync(true);
  assert.equal(pending, undefined);
  await settle();
  assert.deepEqual(executed, []);
  focus.dispose();
  await settle();
});

test('leave after peer Workshop is active does not restore native Outline', async () => {
  const executed: string[] = [];
  let pending: (() => void) | undefined;
  const active = { viewType: undefined as string | undefined };
  const focus = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    activeCustomEditorViewType: () => active.viewType,
    schedule: run => {
      pending = run;
      return { dispose() { pending = undefined; } };
    },
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.sync(false);
  active.viewType = MARKDOWN_WORKSHOP_EDITOR;
  pending!();
  await settle();
  assert.deepEqual(
    executed,
    [],
    'handoff: peer owns the sidebar so leave must not call outline.focus',
  );
  focus.dispose();
  await settle();
});

test('dispose restores native Outline unless a peer Workshop owns the tab', async () => {
  const executed: string[] = [];
  const active = { viewType: undefined as string | undefined };
  const focus = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    activeCustomEditorViewType: () => active.viewType,
    schedule: () => ({ dispose() {} }),
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.dispose();
  await settle();
  assert.deepEqual(executed, [`${NATIVE_OUTLINE_ID}.focus`]);

  const peer = createOutlineFocus({
    execute: async command => { executed.push(command); },
    focusEditor: async () => { executed.push('focusEditor'); },
    activeCustomEditorViewType: () => active.viewType,
    schedule: () => ({ dispose() {} }),
  });
  peer.sync(true);
  await settle();
  executed.length = 0;
  active.viewType = MARKDOWN_WORKSHOP_EDITOR;
  peer.dispose();
  await settle();
  assert.deepEqual(executed, [], 'peer owns the swap; dispose skips restore');
});

function settle(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
