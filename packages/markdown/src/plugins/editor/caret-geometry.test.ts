import test from "node:test";
import assert from "node:assert/strict";
import { BlockType, type EditorView } from "@codemirror/view";
import type { CaretAppearance } from "./caret";
import { measureCarets } from "./caret-geometry";

const appearance: CaretAppearance = {
  style: "line",
  endCaret: false,
  width: 2,
  height: "character",
  variables: {},
};

function view(options: {
  from: number;
  to: number;
  head: number;
  hasFocus: boolean;
  block?: BlockType;
}): { view: EditorView; rects: () => number } {
  let rects = 0;
  const editor = {
    viewport: { from: options.from, to: options.to },
    hasFocus: options.hasFocus,
    state: {
      selection: {
        ranges: [{ anchor: options.head, head: options.head, empty: true }],
      },
    },
    lineBlockAt() {
      return { type: options.block ?? BlockType.Text };
    },
    scrollDOM: {
      getBoundingClientRect() {
        rects += 1;
        return { left: 0, right: 100, top: 0, bottom: 40 };
      },
      clientWidth: 100,
      scrollLeft: 0,
      scrollTop: 0,
    },
  };
  return {
    view: editor as unknown as EditorView,
    rects: () => rects,
  };
}

test("carets outside the viewport do not read scroll geometry", () => {
  const fixture = view({ from: 0, to: 20, head: 80, hasFocus: true });
  assert.deepEqual(measureCarets(fixture.view, appearance, "typing"), []);
  assert.equal(fixture.rects(), 0);
});

test("an empty viewport still measures a caret that may be on screen", () => {
  const fixture = view({ from: 0, to: 0, head: 0, hasFocus: true });
  assert.throws(() => measureCarets(fixture.view, appearance, "typing"));
  assert.equal(fixture.rects(), 1);
});

test("a blurred replaced block does not measure the widget box", () => {
  const fixture = view({
    from: 0,
    to: 40,
    head: 8,
    hasFocus: false,
    block: BlockType.WidgetRange,
  });
  assert.deepEqual(measureCarets(fixture.view, appearance, "typing"), []);
  assert.equal(fixture.rects(), 0);
});

test("a focused text caret still reads geometry", () => {
  const fixture = view({
    from: 0,
    to: 40,
    head: 8,
    hasFocus: true,
    block: BlockType.Text,
  });
  assert.throws(() => measureCarets(fixture.view, appearance, "typing"));
  assert.equal(fixture.rects(), 1);
});
