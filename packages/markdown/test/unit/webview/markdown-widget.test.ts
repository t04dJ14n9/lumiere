import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  CLICK_DRAG_PX,
  clickToEditReleaseCommits,
  latchClickDrag,
  markdownBlockIgnoresEventKind,
  type ClickToEditPress,
} from "../../../src/webview/ui/block-pointer";
import {
  fenceGuardSelection,
  liveFenceOffsets,
  ownsFenceGuardRelease,
  resolveFenceGuardSelection,
  setFenceGuardSelectionEffect,
  shouldGuardFenceMouseDown,
  shouldRestoreFenceClick,
  type FenceGuardPress,
} from "../../../src/webview/ui/fence-click-guard";

const root = new URL("../../../", import.meta.url).pathname;

test("selectionchange is always kept by the widget (native Mermaid labels)", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "selectionchange",
      targetIsElement: false,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("blank-area mousedown stays with the widget (no CM caret in fence)", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("widget-local controls keep their mouse events", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: true,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("native selectable SVG labels keep their mouse events", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: false,
      nativeSelectableLabel: true,
    }),
    true,
  );
});

test("non-element targets (other than selectionchange) do not force ignore", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mouseup",
      targetIsElement: false,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    false,
  );
});

test("click-to-edit latches drag once the threshold is crossed, even if the pointer returns", () => {
  const press: ClickToEditPress = { x: 10, y: 10, dragged: false };
  latchClickDrag(press, 10 + CLICK_DRAG_PX, 10);
  assert.equal(press.dragged, false);
  latchClickDrag(press, 10 + CLICK_DRAG_PX + 1, 10);
  assert.equal(press.dragged, true);
  latchClickDrag(press, 10, 10);
  assert.equal(press.dragged, true);
});

test("click-to-edit commits only for a matching non-drag release over the widget", () => {
  const press: ClickToEditPress = { x: 0, y: 0, dragged: false };
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    true,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press: null,
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: false,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: true,
      onControl: true,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press: { x: 0, y: 0, dragged: true },
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 2,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
});

test("fence click guard arms only outside-shell hits that map into the block", () => {
  const base = {
    button: 0,
    onControl: false,
    targetInsideShell: false,
    pos: 10,
    blockFrom: 5,
    blockTo: 20,
  };
  assert.equal(shouldGuardFenceMouseDown(base), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 5 }), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 20 }), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 4 }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 21 }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: null }), false);
  assert.equal(
    shouldGuardFenceMouseDown({ ...base, targetInsideShell: true }),
    false,
  );
  assert.equal(shouldGuardFenceMouseDown({ ...base, onControl: true }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, button: 2 }), false);
  // Shift/Cmd/chrome must not arm — CM keeps selection / scrollbar.
  assert.equal(shouldGuardFenceMouseDown({ ...base, modified: true }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, onChrome: true }), false);
});

test("plain completed fence margin click restores pre-press selection", () => {
  const press: FenceGuardPress = {
    x: 0,
    y: 0,
    dragged: false,
    selection: EditorSelection.single(3),
    doc: { length: 10 },
  };
  assert.equal(
    shouldRestoreFenceClick({ press, button: 0, modified: false }),
    true,
  );
  assert.equal(
    shouldRestoreFenceClick({
      press: { ...press, dragged: true },
      button: 0,
      modified: false,
    }),
    false,
  );
  assert.equal(
    shouldRestoreFenceClick({ press, button: 0, modified: true }),
    false,
  );
  assert.equal(
    shouldRestoreFenceClick({ press: null, button: 0, modified: false }),
    false,
  );
});

test("Mermaid SVG CSS captures transparent gap clicks on the widget", () => {
  const css = readFileSync(
    path.join(root, "src/plugins/diagrams/diagrams.css"),
    "utf8",
  );
  assert.match(css, /pointer-events:\s*all/);
});

test("fence click guard resolves live offsets from the shell, not captured from/to", () => {
  const shell = {} as Node;
  const view = {
    posAtDOM(node: Node) {
      assert.equal(node, shell);
      return 110; // fence shifted after an edit above
    },
  };
  // Captured creation offsets were 100..150; span length 50 still applies.
  assert.deepEqual(liveFenceOffsets(view, shell, 50), {
    blockFrom: 110,
    blockTo: 160,
  });
  // Guard still arms a margin hit that maps into the *live* fence.
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 110,
      ...liveFenceOffsets(view, shell, 50),
    }),
    true,
  );
  // Stale captured range would miss this (and wrongly swallow nearby content).
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 110,
      blockFrom: 100,
      blockTo: 150,
    }),
    true,
  );
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 155,
      blockFrom: 100,
      blockTo: 150,
    }),
    false,
  );
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 155,
      ...liveFenceOffsets(view, shell, 50),
    }),
    true,
  );
});

test("fence restore skips when doc identity changed and no mapped selection", () => {
  const savedDoc = { length: 100 };
  const currentDoc = { length: 110 };
  const selection = EditorSelection.single(50);
  assert.equal(
    resolveFenceGuardSelection({
      selection,
      savedDoc,
      currentDoc,
    }),
    null,
  );
  assert.equal(
    resolveFenceGuardSelection({
      selection,
      savedDoc,
      currentDoc: savedDoc,
    }),
    selection,
  );
});

test("fence restore prefers mapped selection over stale snapshot", () => {
  const savedDoc = { length: 100 };
  const currentDoc = { length: 110 };
  const stale = EditorSelection.single(50);
  const mapped = EditorSelection.single(60);
  assert.equal(
    resolveFenceGuardSelection({
      selection: stale,
      savedDoc,
      currentDoc,
      mapped,
    }),
    mapped,
  );
  // Explicit map callback when docs diverge.
  assert.equal(
    resolveFenceGuardSelection({
      selection: stale,
      savedDoc,
      currentDoc,
      map: () => mapped,
    }),
    mapped,
  );
});

test("fenceGuardSelection field maps through intervening doc changes", () => {
  const extensions: Extension[] = [fenceGuardSelection];
  let state = EditorState.create({
    doc: "abcdefghij",
    selection: EditorSelection.single(5),
    extensions,
  });
  state = state.update({
    effects: setFenceGuardSelectionEffect(EditorSelection.single(5)),
  }).state;
  assert.equal(state.field(fenceGuardSelection)?.main.head, 5);
  state = state.update({
    changes: { from: 0, to: 0, insert: "XXXX" },
  }).state;
  // Insert before the caret → mapped head advances by 4 (like pointerSelection).
  assert.equal(state.field(fenceGuardSelection)?.main.head, 9);
  assert.equal(state.doc.length, 14);
});

test("duplicate mouseup without release ownership does not clear mapped selection", () => {
  // Second window/document mouseup: takePress already null — must not clear.
  assert.equal(ownsFenceGuardRelease(null), false);
  const press: FenceGuardPress = {
    x: 0,
    y: 0,
    dragged: false,
    selection: EditorSelection.single(5),
    doc: { length: 10 },
  };
  assert.equal(ownsFenceGuardRelease(press), true);
});

import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../../src/plugins/livePreview/api";
import type {
  RenderPass,
  RenderService,
} from "../../../src/plugins/render/api";
import {
  clearMarkdownBlockHtmlCache,
  MarkdownBlock,
} from "../../../src/webview/ui/markdown-widget";

test("MarkdownBlock.toDOM renders synchronously even when requestIdleCallback is present and seeds cached HTML on async remount", async () => {
  clearMarkdownBlockHtmlCache();
  const prevDoc = globalThis.document;
  const prevIdle = (globalThis as Record<string, unknown>).requestIdleCallback;

  class StubElement {
    className = "";
    textContent = "";
    innerHTML = "";
    style: Record<string, string> = {};
    ownerDocument = {
      addEventListener() {},
      defaultView: { addEventListener() {} },
    };
    children: StubElement[] = [];
    classList = {
      classes: new Set<string>(),
      add: (...tokens: string[]) =>
        tokens.forEach((t) => this.classList.classes.add(t)),
      contains: (token: string) => this.classList.classes.has(token),
    };
    setAttribute(): void {}
    addEventListener(): void {}
    append(...nodes: StubElement[]): void {
      this.children.push(...nodes);
    }
    getBoundingClientRect() {
      return { height: 48 };
    }
  }

  let idleCalled = false;
  (globalThis as Record<string, unknown>).requestIdleCallback = () => {
    idleCalled = true;
    return 1;
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new StubElement(),
  };

  try {
    const block: RenderBlock = {
      kind: "blockquote",
      from: 0,
      to: 14,
      source: "> [!note]\n> hi",
    };
    const view = {
      contentDOM: { clientWidth: 640 },
      state: {
        doc: {
          lineAt: () => ({ number: 1 }),
        },
      },
      requestMeasure() {},
    } as unknown as EditorView;

    let syncCalls = 0;
    const syncRender: RenderService = {
      trusted: true,
      async into(container) {
        syncCalls++;
        container.innerHTML = '<div class="callout">hi</div>';
        return {
          source: block.source,
          container,
          sourceLine: 0,
          ancestry: [],
          renderKey: block.source,
          measure() {},
          onDispose() {},
          async dispose() {},
        } as RenderPass;
      },
    };

    const widget = new MarkdownBlock(block, syncRender);
    const shell = widget.toDOM(view) as unknown as StubElement;
    const body = shell.children[1]!;
    assert.equal(
      idleCalled,
      false,
      "toDOM must not defer behind requestIdleCallback",
    );
    assert.equal(
      syncCalls,
      1,
      "render.into must run synchronously inside toDOM",
    );
    assert.equal(body.innerHTML, '<div class="callout">hi</div>');
    widget.destroy(shell as unknown as HTMLElement);

    // Remount with an async RenderService: cached HTML seeds body immediately in 0ms.
    let resolveAsync!: () => void;
    const asyncRender: RenderService = {
      trusted: true,
      into(container) {
        return new Promise<RenderPass>((resolve) => {
          resolveAsync = () => {
            container.innerHTML = '<div class="callout">updated</div>';
            resolve({
              source: block.source,
              container,
              sourceLine: 0,
              ancestry: [],
              renderKey: block.source,
              measure() {},
              onDispose() {},
              async dispose() {},
            } as RenderPass);
          };
        });
      },
    };
    const remountWidget = new MarkdownBlock(block, asyncRender);
    const remountShell = remountWidget.toDOM(view) as unknown as StubElement;
    const remountBody = remountShell.children[1]!;
    assert.equal(
      remountBody.innerHTML,
      '<div class="callout">hi</div>',
      "cached HTML snapshot should populate body synchronously on remount",
    );
    resolveAsync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(remountBody.innerHTML, '<div class="callout">updated</div>');
    remountWidget.destroy(remountShell as unknown as HTMLElement);
  } finally {
    clearMarkdownBlockHtmlCache();
    (globalThis as unknown as { document: unknown }).document = prevDoc;
    (globalThis as Record<string, unknown>).requestIdleCallback = prevIdle;
  }
});

test("MarkdownBlock retains live shell DOM across destroy and toDOM when using the same RenderService", async () => {
  clearMarkdownBlockHtmlCache();
  const prevDoc = globalThis.document;

  class StubElement {
    className = "";
    textContent = "";
    innerHTML = "";
    isConnected = false;
    style: Record<string, string> = {};
    ownerDocument = {
      addEventListener() {},
      removeEventListener() {},
      defaultView: {
        addEventListener() {},
        removeEventListener() {},
      },
    };
    children: StubElement[] = [];
    classList = {
      add() {},
      contains() {
        return false;
      },
    };
    setAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    append(...nodes: StubElement[]) {
      this.children.push(...nodes);
    }
    contains() {
      return false;
    }
    getBoundingClientRect() {
      return { height: 240 };
    }
  }

  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new StubElement(),
  };

  try {
    const block: RenderBlock = {
      from: 0,
      to: 28,
      kind: "code",
      source: "```mermaid\ngraph TD; A-->B\n```",
    };
    const view = {
      state: {
        doc: {
          lineAt: () => ({ number: 1 }),
        },
      },
      dom: new StubElement(),
      requestMeasure() {},
      posAtDOM: () => 0,
    } as unknown as EditorView;

    let renderCalls = 0;
    let disposeCalls = 0;
    const render: RenderService = {
      trusted: true,
      async into(container) {
        renderCalls++;
        container.innerHTML =
          '<pre data-fence="mermaid" aria-label="Mermaid diagram"><svg></svg></pre>';
        return {
          source: block.source,
          container,
          sourceLine: 0,
          ancestry: [],
          renderKey: block.source,
          measure() {},
          onDispose() {},
          async dispose() {
            disposeCalls++;
          },
        } as RenderPass;
      },
    };

    const widget = new MarkdownBlock(block, render);
    const firstShell = widget.toDOM(view);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(renderCalls, 1);

    // Viewport exit: destroy() disconnects observers without disposing the rendered DOM.
    widget.destroy(firstShell);
    assert.equal(disposeCalls, 0);

    // Viewport re-entry on same widget instance returns the exact same live shell:
    const secondShell = widget.toDOM(view);
    assert.equal(secondShell, firstShell);
    assert.equal(renderCalls, 1);
    widget.destroy(secondShell);

    // Even a new MarkdownBlock instance with the same RenderService reclaims the retained shell:
    const recreatedWidget = new MarkdownBlock(block, render);
    const thirdShell = recreatedWidget.toDOM(view);
    assert.equal(thirdShell, firstShell);
    assert.equal(renderCalls, 1);
    recreatedWidget.destroy(thirdShell);
  } finally {
    clearMarkdownBlockHtmlCache();
    (globalThis as unknown as { document: unknown }).document = prevDoc;
  }
});

test("a block keeps its reserved height while a diagram inside still waits for its SVG", async () => {
  clearMarkdownBlockHtmlCache();
  const prevDoc = globalThis.document;

  class StubElement {
    className = "";
    textContent = "";
    innerHTML = "";
    isConnected = true;
    /** Holds an element marked `data-render-pending`. */
    hasPending = false;
    style: Record<string, string> = {};
    ownerDocument = {
      addEventListener() {},
      defaultView: { addEventListener() {} },
    };
    children: StubElement[] = [];
    classList = {
      add() {},
      contains() {
        return false;
      },
    };
    setAttribute() {}
    addEventListener() {}
    append(...nodes: StubElement[]) {
      this.children.push(...nodes);
    }
    querySelector(selector: string) {
      return selector === "[data-render-pending]" && this.hasPending
        ? {}
        : null;
    }
    getBoundingClientRect() {
      return { height: 180 };
    }
  }

  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new StubElement(),
  };
  try {
    const source = "```mermaid\nflowchart TB\n  A --> B\n  B --> C\n```";
    const block: RenderBlock = {
      from: 0,
      to: source.length,
      kind: "diagram",
      source,
    };
    const view = {
      contentDOM: { clientWidth: 640 },
      state: { doc: { lineAt: () => ({ number: 1 }) } },
      requestMeasure() {},
    } as unknown as EditorView;
    let measure = () => {};
    const render: RenderService = {
      trusted: true,
      async into(container, _source, context) {
        measure = context!.measure!;
        container.innerHTML =
          '<pre data-fence="mermaid" data-render-pending><code>flowchart TB</code></pre>';
        (container as unknown as StubElement).hasPending = true;
        return {
          source,
          container,
          sourceLine: 0,
          ancestry: [],
          renderKey: source,
          measure() {},
          onDispose() {},
          async dispose() {},
        } as RenderPass;
      },
    };
    const widget = new MarkdownBlock(block, render);
    const shell = widget.toDOM(view) as unknown as StubElement;
    const body = shell.children[1]!;
    const reserve = shell.style.minHeight;
    assert.match(reserve ?? "", /^\d+px$/, "the diagram's height is reserved");

    // The source's highlighting finishes first and asks for a measure.
    measure();
    assert.equal(shell.style.minHeight, reserve, "kept while pending");

    body.hasPending = false;
    measure();
    assert.equal(shell.style.minHeight, "", "released once the SVG is in");
    widget.destroy(shell as unknown as HTMLElement);
  } finally {
    clearMarkdownBlockHtmlCache();
    (globalThis as unknown as { document: unknown }).document = prevDoc;
  }
});
