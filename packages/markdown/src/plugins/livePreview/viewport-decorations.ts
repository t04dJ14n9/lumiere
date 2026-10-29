import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
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
import { changesMetadata } from "./invalidation";

/** Viewport (+ margin) the block decorator treats as live when explicitly set. */
export const setBlockHotRanges =
  StateEffect.define<readonly { from: number; to: number }[]>();

const FULL_DOC_HOT_RANGES = Symbol("fullDocHotRanges");

type HotRanges = readonly { from: number; to: number }[] & {
  [FULL_DOC_HOT_RANGES]?: true;
};

function fullDocumentHotRanges(docLength: number): HotRanges {
  const ranges: HotRanges = [{ from: 0, to: docLength }];
  Object.defineProperty(ranges, FULL_DOC_HOT_RANGES, {
    value: true,
    enumerable: false,
  });
  return ranges;
}

function isFullDocumentHotRanges(
  ranges: readonly { from: number; to: number }[] | undefined,
): boolean {
  return Boolean(ranges && (ranges as HotRanges)[FULL_DOC_HOT_RANGES] === true);
}

/**
 * Ranges where block widgets mount in the DecorationSet.
 *
 * Matching Obsidian's `m8` StateField architecture, this defaults to the full
 * document so CodeMirror 6's native viewport virtualizer calls `toDOM(view)`
 * only for blocks inside `view.viewport` and reads `estimatedHeight` outside
 * `view.viewport` — without dispatching transactions on scroll. Explicit
 * `setBlockHotRanges` effects still scope live blocks to a custom band.
 */
export const blockHotRanges = StateField.define<
  readonly { from: number; to: number }[]
>({
  create: (state) => fullDocumentHotRanges(state.doc.length),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlockHotRanges)) {
        return effect.value;
      }
    }
    if (!tr.docChanged) {
      return value;
    }
    if (isFullDocumentHotRanges(value)) {
      return fullDocumentHotRanges(tr.state.doc.length);
    }
    return value.map((range) => ({
      from: tr.changes.mapPos(range.from, 1),
      to: tr.changes.mapPos(range.to, -1),
    }));
  },
});

/**
 * Decorations for Live Preview blocks.
 *
 * By default every indexed block gets its `GuardedWidget` replacement and
 * CodeMirror 6's own viewport virtualizer mounts `toDOM()` only inside
 * `view.viewport` (never dispatching transactions on scroll). When an explicit
 * `setBlockHotRanges` band is active, blocks outside that band mount a
 * `DeferredBlockWidget`.
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
  const hot = state.field(blockHotRanges, false);
  if (!hot || isFullDocumentHotRanges(hot)) {
    return fullDocumentHotRanges(state.doc.length);
  }
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
  if (
    isFullDocumentHotRanges(band) ||
    rangesIntersect(block.from, block.to, band)
  ) {
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

const blockViewportTracker = ViewPlugin.define(() => ({}));

/** Hot-range field + viewport tracker; install beside `blockDecorations`. */
export const blockViewportSupport = [blockHotRanges, blockViewportTracker];

export { expandVisibleRanges };
