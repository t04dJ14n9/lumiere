/**
 * When a tall rendered block (an async Mermaid diagram, an image loading, a
 * math block) is partly above the top of the pane and its bottom is on
 * screen, CodeMirror's scroll anchor is that block's top: a height change
 * moves its bottom and the text below it. This plugin scrolls by the same
 * delta when that happens, so the text below stays where the reader's eyes are.
 */
import {
  BlockType,
  ViewPlugin,
  type BlockInfo,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";

export interface TopEdge {
  /** The straddling block, by where it starts and ends. */
  readonly from: number;
  readonly to?: number;
  readonly height: number;
}

export type MeasuredView = Pick<
  EditorView,
  "scrollDOM" | "documentTop" | "lineBlockAt" | "lineBlockAtHeight"
> & {
  readonly scaleY?: number;
};

function isRenderedBlock(block: Pick<BlockInfo, "type">): boolean {
  return block.type !== BlockType.Text && !Array.isArray(block.type);
}

/**
 * The rendered block straddling the pane's top edge with its bottom on
 * screen, after adding `scrolled` to where the pane's top was read. Plain
 * text is left to CodeMirror's own anchor; a block taller than the pane has
 * no text below it on screen to keep still.
 */
function straddlingBlock(
  view: MeasuredView,
  scrolled = 0,
): TopEdge | undefined {
  const scroller = view.scrollDOM;
  const scaleY = view.scaleY || 1;
  // The top edge, in the document's coordinates, as CodeMirror's height map
  // has them; CodeMirror's own anchor looks 8 px below it too.
  const edge =
    (scroller.getBoundingClientRect().top - view.documentTop) / scaleY +
    scrolled;
  if (edge <= 0) {
    return undefined;
  }
  const block = view.lineBlockAtHeight(edge + 8);
  const bottom = block.top + block.height;
  if (
    !isRenderedBlock(block) ||
    block.top >= edge ||
    bottom > edge + scroller.clientHeight
  ) {
    return undefined;
  }
  return {
    from: block.from,
    ...(block.to === undefined ? {} : { to: block.to }),
    height: block.height,
  };
}

/**
 * How far to scroll to hold the bottom of `last`, the block that straddled
 * the top edge when last measured, and what straddles the edge after that.
 * A block that shrank may now end above the view, so it is found by where
 * it starts, not by what straddles the edge now.
 */
export function holdBelow(
  view: MeasuredView,
  last: TopEdge | undefined,
): { scroll: number; now: TopEdge | undefined } {
  const block = last && view.lineBlockAt(last.from);
  const sameRenderedBlock = Boolean(
    last &&
    block &&
    isRenderedBlock(block) &&
    block.from === last.from &&
    (last.to === undefined || block.to === undefined || block.to === last.to),
  );
  const grown =
    sameRenderedBlock && block && last ? block.height - last.height : 0;
  const scroll = Math.abs(grown) > 1 ? grown : 0;
  return { scroll, now: straddlingBlock(view, scroll) };
}

class KeepBelowStill {
  /** The straddling block when last measured. */
  private last: TopEdge | undefined;
  private readonly onScroll = () => this.measure();

  constructor(
    private readonly view: EditorView,
    private readonly isPinned: (view: EditorView) => boolean,
  ) {
    view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
    this.measure();
  }

  update(update: ViewUpdate): void {
    // An edit moves blocks; CodeMirror's own anchor handles what it moves.
    if (update.docChanged) {
      this.last = undefined;
    }
    if (
      update.heightChanged ||
      update.geometryChanged ||
      update.viewportChanged ||
      update.docChanged
    ) {
      this.measure();
    }
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
  }

  /**
   * At CodeMirror's next measure, after it has measured the blocks in view:
   * when the block that straddled the edge has another height, scroll by
   * the difference.
   */
  private measure(): void {
    this.view.requestMeasure({
      key: this,
      read: (view) => holdBelow(view, this.last),
      write: ({ scroll, now }, view) => {
        this.last = now;
        if (scroll && !this.isPinned(view)) {
          view.scrollDOM.scrollTop += scroll * view.scaleY;
        }
      },
    });
  }
}

/** `isPinned`: whether a restored reading position holds the view. */
export function keepTextBelowStill(isPinned: (view: EditorView) => boolean) {
  return ViewPlugin.define((view) => new KeepBelowStill(view, isPinned));
}
