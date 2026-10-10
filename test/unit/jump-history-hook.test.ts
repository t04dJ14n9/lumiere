import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NavigationIntent } from '../../src/shared/navigation-intent';
import { samePosition } from '../../src/shared/pdf-history';
import type { ReadingPosition } from '../../src/shared/reading-position';

/** Exercise the production hooks with controlled IPC and RAF, without React or a browser. */
function loadHook(file: string, modules: Record<string, unknown>, globals: Record<string, unknown>): Record<string, unknown> {
  const source = readFileSync(new URL(`../../src/webview/${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(`(function(require, module, exports) { ${output}\n})`, globals) as
    (require: (id: string) => unknown, module: { exports: Record<string, unknown> }, exports: Record<string, unknown>) => void;
  evaluate(id => {
    assert.ok(id in modules, `Unexpected runtime dependency: ${id}`);
    return modules[id];
  }, module, module.exports);
  return module.exports;
}

function animationFrames() {
  let next = 0;
  const callbacks = new Map<number, () => void>();
  return {
    globals: {
      requestAnimationFrame: (callback: () => void) => { callbacks.set(++next, callback); return next; },
      cancelAnimationFrame: (id: number) => { callbacks.delete(id); },
    },
    run(count = 12) {
      for (let i = 0; i < count; i++) {
        const frame = [...callbacks.values()];
        callbacks.clear();
        for (const callback of frame) callback();
      }
    },
  };
}

interface Hook {
  handle(message: Record<string, unknown>): boolean;
  jump(run: () => void): void;
}

function historyHarness() {
  const frames = animationFrames();
  const intent = new NavigationIntent();
  const choices = { pageLayout: 'single', scrollMode: 'continuous', scrollDirection: 'vertical' } as const;
  let position: ReadingPosition = { ...choices, page: 3, top: 0, left: 0, zoom: 'fitWidth' };
  let zoomLevel: string | number = 'fitWidth';
  let zoomFactor = 1;
  const messages: Record<string, unknown>[] = [];
  const mutations: string[] = [];
  const zoom = {
    getState: () => ({ zoomLevel, currentZoomLevel: zoomFactor }),
    requestZoom: (level: string | number) => {
      mutations.push('zoom');
      zoomLevel = level;
      if (typeof level === 'number') zoomFactor = level;
    },
  };
  const modules = {
    react: {
      useCallback: (callback: unknown) => callback,
      useRef: (current: unknown) => ({ current }),
      useState: (initial: unknown) => [initial, () => undefined],
      useEffect: () => undefined,
    },
    '@embedpdf/plugin-zoom/react': { useZoom: () => ({ provides: zoom }), ZoomMode: { FitWidth: 'fitWidth', FitPage: 'fitPage' } },
    '../shared/pdf-history': { samePosition },
    './host': { postToHost: (message: Record<string, unknown>) => messages.push(message) },
    './plugins': { DOCUMENT_ID: 'pdf' },
    './reading-position': {
      rememberedPosition: () => ({ ...position }),
      nativeZoom: (value: ReadingPosition['zoom']) => value === 'actual' ? 1 : typeof value === 'number' ? value / 100 : value,
    },
  };
  const hooks = loadHook('jump-history.ts', modules, { ...frames.globals, document: { querySelector: () => null } });
  const use = hooks.useJumpHistory as (navigation: unknown, choices: unknown, setChoices: () => void) => Hook;
  const hook = use({
    intent, isReady: () => true, pageCount: 10,
    restore: (next: ReadingPosition) => {
      intent.advance(); // The production navigation.restore also retires zoom-anchor corrections.
      mutations.push(`restore:${next.page}`);
      position = { ...next };
    },
  }, choices, () => { mutations.push('choices'); });
  const capture = (): number => {
    hook.handle({ type: 'historyCapture', token: 1 });
    return messages.at(-1)!.intent as number;
  };
  const restore = (token: number, expectedIntent: number, zoom: ReadingPosition['zoom'] = 'fitWidth') =>
    hook.handle({ type: 'historyRestore', token, expectedIntent, position: { ...position, page: 1, zoom } });
  return { hook, frames, intent, messages, mutations, capture, restore };
}

test('history capture -> user input -> restore IPC rejects stale work before any mutation', () => {
  const harness = historyHarness();
  const captured = harness.capture();
  harness.intent.advance();
  harness.restore(2, captured);
  harness.frames.run();
  assert.deepEqual(harness.mutations, []);
  assert.equal(harness.messages.at(-1)?.ok, false);
});

test('an uninterrupted replay owns its final restore and acknowledges the actual arrival', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture());
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'restore:1']);
  assert.equal(harness.messages.at(-1)?.ok, true);
  assert.equal((harness.messages.at(-1)?.position as ReadingPosition).page, 1);
});

test('new input while replay zoom settles prevents its deferred position mutation', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture(), 200);
  harness.frames.run(1);
  assert.deepEqual(harness.mutations, ['choices', 'zoom']);
  harness.intent.advance();
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'zoom']);
  assert.equal(harness.messages.at(-1)?.ok, false);
});

test('a token-scoped timeout cancels a replay whose animation frames were paused', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture());
  harness.hook.handle({ type: 'historyCancel', token: 2 });
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices']);
  assert.equal(harness.messages.at(-1)?.ok, false);
});

test('a late cancellation of an older token cannot cancel the current replay', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture());
  harness.hook.handle({ type: 'historyCancel', token: 999 });
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'restore:1']);
  assert.equal(harness.messages.at(-1)?.ok, true);
});

test('a newer link cancels a queued replay before it can move the viewport', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture());
  harness.hook.jump(() => { harness.mutations.push('new-link'); });
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'new-link']);
  assert.ok(harness.messages.some(message => message.type === 'historyRestored' && message.ok === false));
});

test('zoom anchor correction checks navigation ownership even before its first frame', () => {
  const frames = animationFrames();
  const intent = new NavigationIntent();
  let onZoom: ((event: { desiredScrollLeft: number; desiredScrollTop: number }) => void) | undefined;
  const scrolls: unknown[] = [];
  const viewport = { scrollLeft: 0, scrollTop: 900, scrollWidth: 2000, scrollHeight: 2000, clientWidth: 500, clientHeight: 500, scrollTo: (value: unknown) => scrolls.push(value) };
  const hooks = loadHook('zoom-scroll.ts', {
    react: { useEffect: (effect: () => unknown) => effect() },
    './plugins': { DOCUMENT_ID: 'pdf' },
    '@embedpdf/plugin-zoom/react': { useZoomCapability: () => ({ provides: { forDocument: () => ({
      onZoomChange: (callback: typeof onZoom) => { onZoom = callback; return () => undefined; },
    }) } }) },
  }, frames.globals);
  const use = hooks.useZoomScrollSettle as (container: unknown, intent: NavigationIntent) => void;
  use({ current: { querySelector: () => viewport } }, intent);
  onZoom!({ desiredScrollLeft: 20, desiredScrollTop: 100 });
  intent.advance(); // A newer link or wheel action already owns scrollTop=900.
  frames.run();
  assert.deepEqual(scrolls, []);
});
