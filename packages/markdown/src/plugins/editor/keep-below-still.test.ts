import assert from "node:assert/strict";
import test from "node:test";
import { BlockType } from "@codemirror/view";
import type { BlockInfo } from "@codemirror/view";
import { holdBelow, type MeasuredView } from "./keep-below-still";

interface Block {
  from: number;
  height: number;
  type: BlockType;
}

/**
 * A note of blocks stacked from the document's top, in a 600 px scroller
 * scrolled to `scrollTop`.
 */
function note(blocks: Block[], scrollTop: number): MeasuredView {
  const placed = () => {
    let top = 0;
    return blocks.map((block) => {
      const info = { ...block, top, bottom: top + block.height };
      top += block.height;
      return info as unknown as BlockInfo;
    });
  };
  return {
    scrollDOM: {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
    } as unknown as HTMLElement,
    documentTop: -scrollTop,
    lineBlockAt: (pos) =>
      [...placed()].reverse().find((block) => block.from <= pos) ??
      placed()[0]!,
    lineBlockAtHeight: (height) =>
      placed().find((block) => block.top + block.height > height) ??
      placed().at(-1)!,
  };
}

const text = (from: number, height = 24): Block => ({
  from,
  height,
  type: BlockType.Text,
});
const diagram = (from: number, height: number): Block => ({
  from,
  height,
  type: BlockType.WidgetRange,
});

test("a rendered block across the top edge is held by its bottom as it resizes", () => {
  // Starts 300 px above the view, ends 600 px into it.
  const blocks = [text(0, 900), diagram(10, 900), text(20), text(30)];
  const first = holdBelow(note(blocks, 1200), undefined);
  assert.deepEqual(first, { scroll: 0, now: { from: 10, height: 900 } });

  blocks[1] = diagram(10, 700);
  const shrunk = holdBelow(note(blocks, 1200), first.now);
  assert.equal(shrunk.scroll, -200, "the text below stays where it was");
  assert.deepEqual(shrunk.now, { from: 10, height: 700 });
});

test("a block that shrinks out of view above is still held by its bottom", () => {
  const blocks = [text(0, 900), diagram(10, 900), text(20), text(30)];
  const first = holdBelow(note(blocks, 1200), undefined);
  blocks[1] = diagram(10, 200);
  assert.equal(holdBelow(note(blocks, 1200), first.now).scroll, -700);
});

test("a line of text across the edge, or a block covering the view, is left to CodeMirror", () => {
  const wrapped = [text(0, 900), text(10, 900), text(20)];
  assert.equal(holdBelow(note(wrapped, 1200), undefined).now, undefined);
  const covering = [text(0, 900), diagram(10, 2000), text(20)];
  assert.equal(holdBelow(note(covering, 1200), undefined).now, undefined);
});

test("a block fully in view is left to CodeMirror", () => {
  const blocks = [text(0, 900), diagram(10, 300), text(20)];
  assert.equal(holdBelow(note(blocks, 850), undefined).now, undefined);
});
