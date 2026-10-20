import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { caretAppearance, caretCharacterPosition } from "./caret";
import type {
  CaretAppearance,
  CaretMode,
  CaretSettings,
  CursorStyle,
} from "./caret";
import { config } from "./manifest";

const base: CaretSettings = {
  cursorStyle: "line",
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  cursorWidth: 3,
};
const modes = [
  "typing",
  "normal",
  "visual",
  "insert",
  "replace",
  "pending",
  "prompt",
] as const satisfies readonly CaretMode[];
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

test("Vim's normal, visual, replace, pending and prompt carets ignore the native cursorStyle; insert follows it", () => {
  const expected: Partial<Record<CaretMode, CaretAppearance["style"]>> = {
    normal: "block",
    visual: "block",
    replace: "underline",
    pending: "half-block",
    prompt: "underline-thin",
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
      assert.equal(appearance.width, "character");
      assert.equal(
        appearance.height,
        { replace: 2, prompt: 1 }[mode as string] ?? "character",
      );
      assert.equal(appearance.endCaret, mode === "visual");
    }
  }
});

test("insert mode is the native caret in all six styles, as in VSCodeVim", () => {
  for (const cursorStyle of styles) {
    assert.deepEqual(
      caretAppearance({ ...base, cursorStyle }, "insert"),
      caretAppearance({ ...base, cursorStyle }, "typing"),
    );
  }
  assert.equal(caretAppearance({ ...base, cursorWidth: 3 }, "insert").width, 3);
  assert.equal(caretAppearance({ ...base, cursorWidth: 0 }, "insert").width, 2);
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
    for (const mode of modes) {
      const { variables } = caretAppearance({ ...base, cursorBlinking }, mode);
      assert.equal(
        variables["--caret-animation"],
        cursorBlinking === "solid" ? "none" : `mw-caret-${cursorBlinking}`,
      );
      // Measured in VS Code 1.141: hard blink 500 ms on and 500 ms off, forever;
      // the others 0.5 s ease-in-out, alternating, 20 half cycles.
      const hard = cursorBlinking === "blink";
      assert.deepEqual(
        [
          variables["--caret-duration"],
          variables["--caret-timing"],
          variables["--caret-count"],
          variables["--caret-direction"],
        ],
        cursorBlinking === "solid"
          ? ["0s", "linear", "1", "normal"]
          : hard
            ? ["1s", "step-end", "infinite", "normal"]
            : ["0.5s", "ease-in-out", "20", "alternate"],
      );
    }
  }
});

test("smooth movement respects off, explicit navigation and all movement", () => {
  for (const mode of modes) {
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
    endCaret: false,
    width: "character",
    height: "character",
    variables: {
      "--caret-animation": "mw-caret-phase",
      "--caret-duration": "0.5s",
      "--caret-timing": "ease-in-out",
      "--caret-count": "20",
      "--caret-direction": "alternate",
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

test("obsidian profile uses accent fat block and 1.06s blink; no visual end caret", () => {
  const appearance = caretAppearance(base, "normal", true, "obsidian");
  assert.equal(appearance.style, "block");
  assert.equal(appearance.endCaret, false);
  assert.equal(appearance.variables["--caret-duration"], "1.06s");
  assert.equal(appearance.variables["--caret-timing"], "step-end");
  assert.match(
    appearance.variables["--caret-foreground"] ?? "",
    /button-background/,
  );
  const visual = caretAppearance(base, "visual", true, "obsidian");
  assert.equal(visual.endCaret, false);
  const pending = caretAppearance(base, "pending", true, "obsidian");
  assert.equal(pending.style, "block");
});

test("vscodevim profile keeps half-block pending and visual end caret", () => {
  const pending = caretAppearance(base, "pending", true, "vscodevim");
  assert.equal(pending.style, "half-block");
  const visual = caretAppearance(base, "visual", true, "vscodevim");
  assert.equal(visual.endCaret, true);
  assert.equal(visual.variables["--caret-foreground"], undefined);
});

test("codemirror profile uses inverse editor colours and fat pending", () => {
  const appearance = caretAppearance(base, "normal", true, "codemirror");
  assert.equal(appearance.style, "block");
  assert.match(
    appearance.variables["--caret-foreground"] ?? "",
    /editor-foreground/,
  );
  assert.equal(appearance.variables["--caret-duration"], "1.06s");
});

test("insert mode ignores vim caret profile and follows native cursorStyle", () => {
  for (const profile of ["obsidian", "vscodevim", "codemirror"] as const) {
    const appearance = caretAppearance(
      { ...base, cursorStyle: "underline" },
      "insert",
      true,
      profile,
    );
    assert.equal(appearance.style, "underline", profile);
    assert.equal(
      appearance.variables["--caret-foreground"],
      undefined,
      profile,
    );
  }
});
