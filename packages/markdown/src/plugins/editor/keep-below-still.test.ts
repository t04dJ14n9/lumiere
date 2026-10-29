import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BlockType, type BlockInfo } from "@codemirror/view";
import { holdBelow, type MeasuredView } from "./keep-below-still";

interface Block {
  from: number;
  to?: number;
  height: number;
  type: BlockType | readonly BlockInfo[];
}

function note(
  blocks: readonly Block[],
  scrollTop: number,
  clientHeight = 800,
  scaleY = 1,
): MeasuredView {
  let top = 0;
  const laid = blocks.map((block) => {
    const info = {
      from: block.from,
      to: block.to ?? block.from + 1,
      top,
      height: block.height,
      type: block.type,
    } as unknown as BlockInfo;
    top += block.height;
    return info;
  });
  return {
    documentTop: -scrollTop * scaleY,
    scaleY,
    scrollDOM: {
      clientHeight,
      getBoundingClientRect: () => ({ top: 0 }) as DOMRect,
    } as HTMLElement,
    lineBlockAt: (pos) =>
      laid.find((block) => block.from <= pos && pos <= block.to) ?? laid[0]!,
    lineBlockAtHeight: (height) =>
      laid.find((block) => block.top + block.height >= height) ??
      laid[laid.length - 1]!,
  };
}

const text = (from: number, height: number, to?: number): Block => ({
  from,
  ...(to === undefined ? {} : { to }),
  height,
  type: BlockType.Text,
});
const diagram = (from: number, height: number, to?: number): Block => ({
  from,
  ...(to === undefined ? {} : { to }),
  height,
  type: BlockType.WidgetRange,
});

describe("holdBelow", () => {
  it("scrolls by the delta when a rendered block straddling the top edge changes height", () => {
    const before = note([text(0, 100), diagram(10, 900), text(20, 400)], 500);
    const first = holdBelow(before, undefined);
    assert.deepEqual(first, {
      scroll: 0,
      now: { from: 10, to: 11, height: 900 },
    });

    const after = note([text(0, 100), diagram(10, 620), text(20, 400)], 500);
    const second = holdBelow(after, first.now);
    assert.deepEqual(second, {
      scroll: -280,
      now: { from: 10, to: 11, height: 620 },
    });
  });

  it("leaves plain text and blocks taller than the pane to CodeMirror", () => {
    const plain = note([text(0, 900), text(10, 400)], 500);
    assert.equal(holdBelow(plain, undefined).now, undefined);

    const tallerThanPane = note([diagram(0, 1500), text(10, 400)], 200, 800);
    assert.equal(holdBelow(tallerThanPane, undefined).now, undefined);
  });

  it("does not jump upward when a top-straddling rendered block unfolds into source lines", () => {
    const before = note(
      [text(0, 100, 9), diagram(10, 900, 50), text(51, 400, 80)],
      500,
    );
    const first = holdBelow(before, undefined);
    assert.deepEqual(first, {
      scroll: 0,
      now: { from: 10, to: 50, height: 900 },
    });

    // Unfolding replaces the single WidgetRange [10..50] with individual text lines.
    const unfolded = note(
      [
        text(0, 100, 9),
        text(10, 24, 20),
        text(21, 24, 30),
        text(31, 24, 50),
        text(51, 400, 80),
      ],
      500,
    );
    const second = holdBelow(unfolded, first.now);
    assert.equal(second.scroll, 0);
    assert.equal(second.now, undefined);
  });

  it("does not jump when a rendered block's span changes or becomes a composite block", () => {
    const before = note(
      [text(0, 100, 9), diagram(10, 900, 50), text(51, 400, 80)],
      500,
    );
    const first = holdBelow(before, undefined);

    const differentSpan = note(
      [text(0, 100, 9), diagram(10, 24, 20), text(51, 400, 80)],
      500,
    );
    assert.equal(holdBelow(differentSpan, first.now).scroll, 0);

    const composite = note(
      [
        text(0, 100, 9),
        { from: 10, to: 50, height: 24, type: [] },
        text(51, 400, 80),
      ],
      500,
    );
    assert.equal(holdBelow(composite, first.now).scroll, 0);
  });

  it("divides the top-edge offset by view.scaleY when the editor is scaled", () => {
    const scaledBefore = note(
      [text(0, 100, 9), diagram(10, 900, 50), text(51, 400, 80)],
      500,
      800,
      2,
    );
    const first = holdBelow(scaledBefore, undefined);
    assert.deepEqual(first, {
      scroll: 0,
      now: { from: 10, to: 50, height: 900 },
    });

    const scaledAfter = note(
      [text(0, 100, 9), diagram(10, 620, 50), text(51, 400, 80)],
      500,
      800,
      2,
    );
    const second = holdBelow(scaledAfter, first.now);
    assert.deepEqual(second, {
      scroll: -280,
      now: { from: 10, to: 50, height: 620 },
    });
  });
});
