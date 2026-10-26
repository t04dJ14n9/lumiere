import {
  BlockType,
  ViewPlugin,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Keeps the text below the top edge still when the block straddling that
 * edge changes height.
 *
 * CodeMirror holds the scroll position by the top of the block at the top
 * edge. When that block starts above the view and ends inside it, and it
 * changes height (a diagram drawn shorter or taller than its reserve, an
 * image loading, a formula typeset), holding its top, which is off screen,
 * moves all the text below it, which is what the reader sees. This holds
 * the block's bottom instead. A block that covers the whole view keeps
 * CodeMirror's way: the reader sees only the block.
 *
 * Only rendered blocks count. A line of text changes height when CodeMirror
 * first measures it, in place of its guess, as when it scrolls a heading
 * into view after a jump, and CodeMirror places that scroll itself.
 */
interface TopEdge {
  /** The straddling block, by where it starts. */
  readonly from: number;
  readonly height: number;
}

/**
 * The block across the top edge, when its bottom is in view; `scrolled` is
 * a scroll about to be made.
 */
function straddlingBlock(view: EditorView, scrolled = 0): TopEdge | undefined {
  const scroller = view.scrollDOM;
  // The top edge, in the document's coordinates, as CodeMirror's height map
  // has them; CodeMirror's own anchor looks 8 px below it too.
  const edge =
    scroller.getBoundingClientRect().top - view.documentTop + scrolled;
  if (edge <= 0) {
    return undefined;
  }
  const block = view.lineBlockAtHeight(edge + 8);
  const bottom = block.top + block.height;
  if (
    block.type === BlockType.Text ||
    Array.isArray(block.type) ||
    block.top >= edge ||
    bottom > edge + scroller.clientHeight
  ) {
    return undefined;
  }
  return { from: block.from, height: block.height };
}

class KeepBelowStill {
  /** The straddling block when last measured. */
  private last: TopEdge | undefined;
  private readonly onScroll = () => this.measure();

  constructor(private readonly view: EditorView) {
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
   * the difference. A block that shrank may now end above the view, so it
   * is found by where it starts, not by what straddles the edge now.
   */
  private measure(): void {
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        const last = this.last;
        const block = last && view.lineBlockAt(last.from);
        const grown =
          last && block && block.from === last.from
            ? block.height - last.height
            : 0;
        const scroll = Math.abs(grown) > 1 ? grown : 0;
        return { scroll, now: straddlingBlock(view, scroll) };
      },
      write: ({ scroll, now }, view) => {
        this.last = now;
        if (scroll) {
          view.scrollDOM.scrollTop += scroll * view.scaleY;
        }
      },
    });
  }
}

export const keepTextBelowStill = ViewPlugin.fromClass(KeepBelowStill);
