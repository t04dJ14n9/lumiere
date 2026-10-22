import { WidgetType } from "@codemirror/view";
import type { RenderBlock } from "./api";
import { markdownBlockEstimatedHeight } from "../../webview/ui/markdown-block-height";

/**
 * Below-fold stand-in for a Live Preview block widget. Keeps CodeMirror's
 * height map honest via `estimatedHeight` / minHeight without running
 * Mermaid, MathJax, embed fetches or table DOM until the block scrolls near
 * the viewport.
 */
export class DeferredBlockWidget extends WidgetType {
  constructor(readonly block: RenderBlock) {
    super();
  }

  override eq(other: DeferredBlockWidget): boolean {
    return (
      this.block.kind === other.block.kind &&
      this.block.source === other.block.source
    );
  }

  override toDOM(): HTMLElement {
    const shell = document.createElement("div");
    shell.className = `hybrid-block hybrid-deferred hybrid-${this.block.kind}`;
    shell.setAttribute("data-deferred-block", this.block.kind);
    const reserve = this.estimatedHeight;
    if (reserve > 0 && shell.style) {
      shell.style.minHeight = `${reserve}px`;
    }
    return shell;
  }

  override get estimatedHeight(): number {
    return deferredBlockHeight(this.block);
  }
}

/**
 * Cheap height reserve without constructing feature widgets. Tables use a
 * row×cell estimate aligned with `tables/estimated-height` (kept local so
 * livePreview does not import sibling plugins). Everything else shares the
 * MarkdownBlock estimator (math / Mermaid / callout / HTML / embeds).
 */
export function deferredBlockHeight(block: RenderBlock): number {
  if (block.kind === "Table") {
    const rows = block.source
      .split("\n")
      .filter((line) => /^\s*\|/.test(line)).length;
    const row = 8 + 16 * 1.3;
    return 24 + Math.max(1, rows) * row;
  }
  return markdownBlockEstimatedHeight(block.source);
}

/**
 * Characters of source kept warm beyond `visibleRanges`. About two short
 * screens of prose; enough that a wheel tick mounts real widgets before the
 * user stares at a deferred shell.
 */
export const VIEWPORT_BLOCK_MARGIN = 5000;

export function expandVisibleRanges(
  visible: readonly { from: number; to: number }[],
  docLength: number,
  margin = VIEWPORT_BLOCK_MARGIN,
): { from: number; to: number }[] {
  if (visible.length === 0) {
    return [{ from: 0, to: Math.min(docLength, margin * 2) }];
  }
  return visible.map((range) => ({
    from: Math.max(0, range.from - margin),
    to: Math.min(docLength, range.to + margin),
  }));
}

export function rangesIntersect(
  from: number,
  to: number,
  ranges: readonly { from: number; to: number }[],
): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}
