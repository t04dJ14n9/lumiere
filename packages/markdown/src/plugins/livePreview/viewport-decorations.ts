import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  isRevealFrozen,
  revealFreezeToggled,
} from "../../webview/ui/pointer-selection";
import type { BlockRenderer, RenderBlock } from "./api";
import { blockDecoration, blockIndex, redecorate } from "./blocks";
import {
  DeferredBlockWidget,
  expandVisibleRanges,
  rangesIntersect,
} from "./deferred-block";
import { firstPaintParseEnd } from "./document-tree";
import { changesMetadata } from "./invalidation";
/** Viewport (+ margin) the block decorator treats as live. */
export const setBlockHotRanges =
  StateEffect.define<readonly { from: number; to: number }[]>();

/**
 * Ranges where block widgets mount for real. Defaults to the start of the
 * document so EditorState-only tests and the first paint before the view
 * reports `visibleRanges` only pay for the opening screen. The viewport
 * tracker updates this as the user scrolls; the caret range is always unioned
 * in at decorate time so reveal-on-focus still works below the fold.
 */
export const blockHotRanges = StateField.define<
  readonly { from: number; to: number }[]
>({
  create: (state) => [{ from: 0, to: firstPaintParseEnd(state.doc) }],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlockHotRanges)) {
        return effect.value;
      }
    }
    if (!tr.docChanged) {
      return value;
    }
    return value.map((range) => ({
      from: tr.changes.mapPos(range.from, 1),
      to: tr.changes.mapPos(range.to, -1),
    }));
  },
});

/**
 * Decorations for Live Preview blocks, scoped to the viewport (+ margin).
 *
 * Blocks intersecting the expanded visible ranges (or the caret) mount real
 * feature widgets. Everything else keeps a cheap `DeferredBlockWidget` so the
 * height map stays stable without running render passes below the fold.
 */
export function blockDecorations(report: (error: unknown) => void) {
  const build = (state: EditorState): DecorationSet =>
    Decoration.set(liveBlockRanges(state, report), true);
  return StateField.define<DecorationSet>({
    create: build,
    update(value, tr) {
      const hotChanged = tr.effects.some((effect) =>
        effect.is(setBlockHotRanges),
      );
      if (
        changesMetadata(tr) ||
        hotChanged ||
        !tr.startState.field(blockIndex, false)
      ) {
        return build(tr.state);
      }
      const freeze = revealFreezeToggled(tr.startState, tr.state);
      if (
        !tr.docChanged &&
        !freeze &&
        (isRevealFrozen(tr.state) || !tr.selection)
      ) {
        return value;
      }
      return (
        redecorate(value, tr, report, (state, block, reportError) =>
          decorateForBand(state, block, reportError),
        ) ?? build(tr.state)
      );
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function liveBand(state: EditorState): readonly { from: number; to: number }[] {
  const hot =
    state.field(blockHotRanges, false) ??
    expandVisibleRanges([], state.doc.length);
  const selection = state.selection.ranges.map((range) => ({
    from: Math.max(0, range.from - 64),
    to: Math.min(state.doc.length, range.to + 64),
  }));
  return [...hot, ...selection];
}

function liveBlockRanges(
  state: EditorState,
  report: (error: unknown) => void,
): Range<Decoration>[] {
  const band = liveBand(state);
  const ranges: Range<Decoration>[] = [];
  for (const block of state.field(blockIndex)) {
    ranges.push(...decorateForBand(state, block, report, band));
  }
  return ranges;
}

function decorateForBand(
  state: EditorState,
  block: RenderBlock & { renderer: BlockRenderer },
  report: (error: unknown) => void,
  band: readonly { from: number; to: number }[] = liveBand(state),
): Range<Decoration>[] {
  if (rangesIntersect(block.from, block.to, band)) {
    return blockDecoration(state, block, report);
  }
  if (block.renderer.showSource?.(state, block)) {
    return [];
  }
  return [
    Decoration.replace({
      block: true,
      widget: new DeferredBlockWidget(block),
    }).range(block.from, block.to),
  ];
}

const blockViewportTracker = ViewPlugin.define(() => {
  let queued = false;
  return {
    update(update: ViewUpdate) {
      if (!update.viewportChanged && !update.docChanged) {
        return;
      }
      const next = expandVisibleRanges(
        update.view.visibleRanges,
        update.state.doc.length,
      );
      const prev = update.state.field(blockHotRanges, false);
      if (prev && sameRanges(prev, next)) {
        return;
      }
      if (queued) {
        return;
      }
      queued = true;
      const view = update.view;
      queueMicrotask(() => {
        queued = false;
        if (!view.dom.isConnected) {
          return;
        }
        const latest = expandVisibleRanges(
          view.visibleRanges,
          view.state.doc.length,
        );
        const current = view.state.field(blockHotRanges, false);
        if (current && sameRanges(current, latest)) {
          return;
        }
        view.dispatch({ effects: setBlockHotRanges.of(latest) });
      });
    },
  };
});

function sameRanges(
  left: readonly { from: number; to: number }[],
  right: readonly { from: number; to: number }[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (range, index) =>
      range.from === right[index]!.from && range.to === right[index]!.to,
  );
}

/** Hot-range field + viewport tracker; install beside `blockDecorations`. */
export const blockViewportSupport = [blockHotRanges, blockViewportTracker];
