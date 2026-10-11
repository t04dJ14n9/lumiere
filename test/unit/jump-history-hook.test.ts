import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NavigationIntent } from '../../src/shared/navigation-intent';
import { restoredZoomReady } from '../../src/shared/restored-zoom';
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
  jump(run: () => void, requestId?: number, acceptPreview?: boolean, expectedIntent?: number): void;
  preview(run: () => void): void;
  endPreview(): void;
}

function historyHarness(initialZoom: 'fitWidth' | 'fitPage' = 'fitWidth', initialFactor = 1) {
  const frames = animationFrames();
  const intent = new NavigationIntent();
  const choices = { pageLayout: 'single', scrollMode: 'continuous', scrollDirection: 'vertical' } as const;
  let position: ReadingPosition = { ...choices, page: 3, top: 0, left: 0, zoom: initialZoom };
  let zoomLevel: string | number = initialZoom;
  let zoomFactor = initialFactor;
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
    '../shared/restored-zoom': { restoredZoomReady },
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
  const setPosition = (next: Partial<ReadingPosition>): void => { position = { ...position, ...next }; };
  return { hook, frames, intent, messages, mutations, capture, restore, setPosition, zoomState: zoom.getState };
}

function jumpPages(messages: Record<string, unknown>[]): number[][] {
  return messages.filter(message => message.type === 'historyJump').map(message => [
    (message.from as ReadingPosition).page,
    (message.to as ReadingPosition).page,
  ]);
}

test('accepting the same search result records the location before its passive preview', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.frames.run();
  assert.equal(jumpPages(harness.messages).length, 0);
  harness.hook.jump(() => harness.setPosition({ page: 8 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[3, 8]]);
});

test('repeated passive previews retain the first origin without recording intermediate stops', () => {
  const harness = historyHarness();
  harness.setPosition({ page: 3, top: 70, left: 12 });
  harness.hook.preview(() => harness.setPosition({ page: 5, top: 20 }));
  harness.hook.preview(() => harness.setPosition({ page: 8, top: 140 }));
  harness.frames.run();
  assert.equal(jumpPages(harness.messages).length, 0);
  harness.hook.jump(() => harness.setPosition({ page: 8, top: 140 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[3, 8]]);
  const from = harness.messages.find(message => message.type === 'historyJump')!.from as ReadingPosition;
  assert.equal(from.top, 70);
  assert.equal(from.left, 12);
});

test('ending a preview prevents a later search action from reusing its old origin', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.hook.endPreview();
  harness.hook.jump(() => harness.setPosition({ page: 9 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[8, 9]]);
});

test('an unrelated jump leaves from the current preview and clears its original source', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.hook.jump(() => harness.setPosition({ page: 6 }));
  harness.frames.run();
  harness.hook.preview(() => harness.setPosition({ page: 9 }));
  harness.hook.jump(() => harness.setPosition({ page: 9 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[8, 6], [6, 9]]);
});

test('reader movement retires the preview origin before an explicit result is accepted', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.intent.interrupt();
  harness.setPosition({ page: 6, top: 75 });
  harness.hook.jump(() => harness.setPosition({ page: 8, top: 0 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[6, 8]]);
  const from = harness.messages.find(message => message.type === 'historyJump')!.from as ReadingPosition;
  assert.equal(from.top, 75);
});

test('a new passive preview after reader movement captures the new reading location', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.intent.interrupt();
  harness.setPosition({ page: 6 });
  harness.hook.preview(() => harness.setPosition({ page: 9 }));
  harness.hook.jump(() => harness.setPosition({ page: 9 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[6, 9]]);
});

test('query cancellation tokens and search-control clicks preserve the session origin', () => {
  const harness = historyHarness();
  harness.hook.preview(() => harness.setPosition({ page: 5 }));
  harness.intent.advance(); // Editing a query invalidates its earlier asynchronous results.
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.intent.advance(); // Pointer-down on Next match cancels older viewport work only.
  harness.hook.jump(() => harness.setPosition({ page: 8 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(jumpPages(harness.messages), [[3, 8]]);
});

test('stale restore and timeout messages do not erase a newer search preview origin', () => {
  const harness = historyHarness();
  const stale = harness.intent.current();
  harness.hook.preview(() => harness.setPosition({ page: 8 }));
  harness.restore(99, stale);
  harness.hook.handle({ type: 'historyCancel', token: 99 });
  harness.hook.jump(() => harness.setPosition({ page: 8 }), undefined, true);
  harness.frames.run();
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(jumpPages(harness.messages), [[3, 8]]);
});

test('real navigation input distinguishes reader movement from search controls', () => {
  class Element {
    private readonly region: 'viewport' | 'input' | 'button';
    constructor(region: 'viewport' | 'input' | 'button') { this.region = region; }
    closest(selector: string): Element | null {
      return (selector === '.viewport' ? this.region === 'viewport' : this.region === 'input') ? this : null;
    }
  }
  class KeyboardEvent {
    readonly altKey = false;
    readonly ctrlKey = false;
    readonly metaKey = false;
    readonly shiftKey = false;
    readonly key: string;
    readonly target: Element;
    constructor(key: string, target: Element) { this.key = key; this.target = target; }
  }
  const listeners = new Map<string, (event: unknown) => void>();
  const hooks = loadHook('navigation.ts', {
    react: {
      useCallback: (callback: unknown) => callback,
      useRef: (current: unknown) => ({ current }),
      useState: (initial?: unknown) => [typeof initial === 'function' ? initial() : initial, () => undefined],
      useEffect: (effect: () => unknown) => effect(),
    },
    './scroll-state': { useScrollState: () => ({ state: { currentPage: 3, totalPages: 10, virtualItems: [] } }) },
    '@embedpdf/plugin-scroll/react': { useScrollCapability: () => ({}) },
    '../shared/geometry': { fromViewRect: (rect: unknown) => rect },
    '../shared/navigation-intent': { NavigationIntent },
    './reading-position': { rememberedPosition: () => ({ page: 3 }) },
  }, { Element, KeyboardEvent, document: { addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) } });
  const use = hooks.useNavigation as (id: string, mode: string, smooth: boolean) => { intent: NavigationIntent };
  const { intent } = use('pdf', 'continuous', false);
  const emit = (name: string, event: unknown): void => { listeners.get(name)!(event); };
  assert.equal(intent.readerRevision(), 0);
  emit('pointerdown', { target: new Element('button') });
  emit('keydown', new KeyboardEvent('ArrowRight', new Element('input')));
  assert.equal(intent.current(), 2);
  assert.equal(intent.readerRevision(), 0);
  emit('wheel', { target: new Element('viewport') });
  emit('pointerdown', { target: new Element('viewport') });
  emit('touchstart', { target: new Element('viewport') });
  emit('keydown', new KeyboardEvent('PageDown', new Element('button')));
  assert.equal(intent.current(), 6);
  assert.equal(intent.readerRevision(), 4);
});

test('history capture -> user input -> restore IPC rejects stale work before any mutation', () => {
  const harness = historyHarness();
  const captured = harness.capture();
  harness.intent.advance();
  harness.restore(2, captured);
  harness.frames.run();
  assert.deepEqual(harness.mutations, []);
  assert.equal(harness.messages.at(-1)?.ok, false);
  harness.capture();
  assert.equal(harness.messages.at(-1)?.startedToken, 0);
});

test('an uninterrupted replay owns its final restore and acknowledges the actual arrival', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture());
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'restore:1']);
  assert.equal(harness.messages.at(-1)?.ok, true);
  assert.equal((harness.messages.at(-1)?.position as ReadingPosition).page, 1);
});

for (const [mode, scale, percent] of [['fitWidth', 1, 100], ['fitPage', 2, 200]] as const) {
  test(`history replay changes ${mode} at scale ${scale} to numeric ${percent} before acknowledging arrival`, () => {
    const harness = historyHarness(mode, scale);
    harness.restore(2, harness.capture(), percent);
    harness.frames.run(1);
    assert.deepEqual(harness.mutations, ['choices', 'zoom']);
    assert.deepEqual(harness.zoomState(), { zoomLevel: scale, currentZoomLevel: scale });
    assert.equal(harness.messages.some(message => message.type === 'historyRestored'), false);
    harness.frames.run();
    assert.deepEqual(harness.mutations, ['choices', 'zoom', 'restore:1']);
    const arrival = harness.messages.at(-1)!;
    assert.equal(arrival.type, 'historyRestored');
    assert.equal(arrival.ok, true);
    assert.equal((arrival.position as ReadingPosition).page, 1);
    assert.equal((arrival.position as ReadingPosition).zoom, percent);
  });
}

test('new input while replay zoom settles prevents its deferred position mutation', () => {
  const harness = historyHarness();
  harness.restore(2, harness.capture(), 200);
  harness.frames.run(1);
  assert.deepEqual(harness.mutations, ['choices', 'zoom']);
  harness.intent.advance();
  harness.frames.run();
  assert.deepEqual(harness.mutations, ['choices', 'zoom']);
  assert.equal(harness.messages.at(-1)?.ok, false);
  harness.capture();
  assert.equal(harness.messages.at(-1)?.startedToken, 2);
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

test('native precise delivery rejects reader input between capture and delivery', () => {
  const harness = historyHarness();
  const captured = harness.intent.current();
  harness.intent.advance();
  harness.hook.jump(() => harness.mutations.push('stale native jump'), 801, false, captured);
  assert.deepEqual(harness.mutations, []);
  assert.equal(harness.messages.at(-1)?.type, 'historyRestored');
  assert.equal(harness.messages.at(-1)?.token, 801);
  assert.equal(harness.messages.at(-1)?.ok, false);
});
test('native precise delivery acknowledges settlement and rejects interrupted settlement', () => {
  const harness = historyHarness();
  harness.hook.jump(() => harness.setPosition({page: 9}), 802, false, harness.intent.current());
  assert.equal(harness.messages.some(message => message.type === 'historyRestored'), false);
  harness.frames.run();
  assert.equal(harness.messages.at(-1)?.token, 802);
  assert.equal(harness.messages.at(-1)?.ok, true);
  harness.hook.jump(() => harness.setPosition({page: 3}), 803, false, harness.intent.current());
  harness.intent.advance();
  harness.frames.run();
  assert.equal(harness.messages.at(-1)?.token, 803);
  assert.equal(harness.messages.at(-1)?.ok, false);
});
