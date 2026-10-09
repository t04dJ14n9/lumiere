import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { caretAppearance, caretCharacterPosition } from "./caret";
import type { CaretMode, CaretSettings, CursorStyle } from "./caret";
import { config } from "./manifest";

const base: CaretSettings = {
  cursorStyle: "line",
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  cursorWidth: 3,
};
const styles: CursorStyle[] = [
  "line",
  "block",
  "underline",
  "line-thin",
  "block-outline",
  "underline-thin",
];

test("visual and pending visual replace carets cover the active character, including complete Unicode clusters", () => {
  const document = Text.of(["a🙂e\u0301z", "tail"]);
  for (const mode of ["visual", "replace"] as const) {
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 1 }, mode),
      0,
    );
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 3 }, mode),
      1,
    );
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 5 }, mode),
      3,
    );
    assert.equal(
      caretCharacterPosition(document, { anchor: 5, head: 1 }, mode),
      1,
    );
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 6 }, mode),
      6,
    );
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 7 }, mode),
      6,
    );
    const end = document.length;
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: end }, mode),
      end - 1,
    );
  }
  for (const mode of ["typing", "normal", "insert"] as const) {
    assert.equal(
      caretCharacterPosition(document, { anchor: 0, head: 3 }, mode),
      3,
    );
  }
  assert.equal(
    caretCharacterPosition(Text.empty, { anchor: 0, head: 0 }, "visual"),
    0,
  );
});

test("Vim mode chooses block, line or underline regardless of the native cursorStyle", () => {
  const expected: Partial<Record<CaretMode, CursorStyle>> = {
    normal: "block",
    visual: "block",
    insert: "line",
    replace: "underline",
  };
  for (const cursorStyle of styles) {
    for (const [mode, style] of Object.entries(expected)) {
      const appearance = caretAppearance(
        { ...base, cursorStyle },
        mode as CaretMode,
      );
      assert.equal(
        appearance.style,
        style,
        `${mode} with native ${cursorStyle}`,
      );
      assert.equal(appearance.width, mode === "insert" ? 3 : "character");
      assert.equal(appearance.height, mode === "replace" ? 2 : "character");
    }
  }
});

test("normal typing honours all six native styles and their thicknesses", () => {
  const dimensions = [
    [3, "character"],
    ["character", "character"],
    ["character", 2],
    [1, "character"],
    ["character", "character"],
    ["character", 1],
  ];
  styles.forEach((cursorStyle, index) => {
    const appearance = caretAppearance({ ...base, cursorStyle }, "typing");
    assert.equal(appearance.style, cursorStyle);
    assert.deepEqual(
      [appearance.width, appearance.height],
      dimensions[index],
      cursorStyle,
    );
  });
  for (const cursorWidth of [0, -1, NaN, Infinity]) {
    assert.equal(caretAppearance({ ...base, cursorWidth }, "insert").width, 2);
  }
  assert.equal(caretAppearance({ ...base, cursorWidth: 5 }, "insert").width, 5);
});

test("native blinking selects distinct hard, smooth, phase, expand or solid animations in every mode", () => {
  for (const cursorBlinking of [
    "blink",
    "smooth",
    "phase",
    "expand",
    "solid",
  ] as const) {
    for (const mode of [
      "typing",
      "normal",
      "visual",
      "insert",
      "replace",
    ] as const) {
      const { variables } = caretAppearance({ ...base, cursorBlinking }, mode);
      assert.equal(
        variables["--caret-animation"],
        cursorBlinking === "solid" ? "none" : `mw-caret-${cursorBlinking}`,
      );
      assert.equal(
        variables["--caret-timing"],
        cursorBlinking === "blink" ? "steps(1, end)" : "linear",
      );
    }
  }
});

test("smooth movement respects off, explicit navigation and all movement", () => {
  for (const mode of [
    "typing",
    "normal",
    "visual",
    "insert",
    "replace",
  ] as const) {
    for (const cursorSmoothCaretAnimation of [
      "off",
      "explicit",
      "on",
    ] as const) {
      for (const isExplicitMove of [true, false]) {
        const { variables } = caretAppearance(
          { ...base, cursorSmoothCaretAnimation },
          mode,
          isExplicitMove,
        );
        const enabled =
          cursorSmoothCaretAnimation === "on" ||
          (cursorSmoothCaretAnimation === "explicit" && isExplicitMove);
        assert.equal(
          variables["--caret-move-duration"],
          enabled ? "80ms" : "0ms",
        );
      }
    }
  }
});

test("native caret settings validate at the host/webview schema and fall back for invalid values", () => {
  const settings = config.parse({
    cursorStyle: "block-outline",
    cursorBlinking: "phase",
    cursorSmoothCaretAnimation: "explicit",
    cursorWidth: 4,
  });
  assert.deepEqual(caretAppearance(settings, "typing"), {
    style: "block-outline",
    width: "character",
    height: "character",
    variables: {
      "--caret-animation": "mw-caret-phase",
      "--caret-timing": "linear",
      "--caret-move-duration": "80ms",
    },
  });
  const fallback = config.parse({
    cursorStyle: "fat",
    cursorBlinking: "fast",
    cursorSmoothCaretAnimation: true,
    cursorWidth: -1,
  });
  assert.equal(fallback.cursorStyle, "line");
  assert.equal(fallback.cursorBlinking, "blink");
  assert.equal(fallback.cursorSmoothCaretAnimation, "off");
  assert.equal(fallback.cursorWidth, 0);
});
