import test from "node:test";
import assert from "node:assert/strict";
import { fontSize, fontVariables, lineHeightPixels } from "./font";
import type { FontSettings } from "./font";

const base: FontSettings = {
  fontFamily: "",
  fontSize: 16,
  fontWeight: "normal",
  lineHeight: 0,
  letterSpacing: 0,
  fontLigatures: false,
  fontVariations: false,
};

test("without host settings the size is Obsidian's 16px and VS Code's ligature and variation defaults apply", () => {
  assert.deepEqual(fontVariables(base), {
    "--text-size": "16px",
    "--text-weight": "normal",
    "--line-height": "1.375",
    "--text-features": '"liga" off, "calt" off',
    "--text-variations": "normal",
  });
});

test("the family gets a monospace fallback and the code font follows it", () => {
  const vars = fontVariables({
    ...base,
    fontFamily: "'JetBrains Mono', Menlo",
  });
  assert.equal(vars["--text-font"], "'JetBrains Mono', Menlo, monospace");
  assert.equal(vars["--code-font"], vars["--text-font"]);
  assert.equal(
    fontVariables({ ...base, fontFamily: "'Droid Sans Mono', monospace" })[
      "--text-font"
    ],
    "'Droid Sans Mono', monospace",
  );
  // A value cannot end the declaration and add others.
  assert.equal(
    fontVariables({ ...base, fontFamily: "A; color: red" })["--text-font"],
    "A color: red, monospace",
  );
});

test("line height follows VS Code: automatic at 0, a multiplier below 8, otherwise pixels, rounded", () => {
  // VS Code's automatic line height: round(1.35 × size), 1.5 on macOS.
  for (const [size, linux, mac] of [
    [12, 16, 18],
    [14, 19, 21],
    [16, 22, 24],
    [20, 27, 30],
  ] as const) {
    assert.equal(lineHeightPixels(0, size, false), linux, `${size}px`);
    assert.equal(lineHeightPixels(0, size, true), mac, `${size}px on macOS`);
    const ratio = Number(
      fontVariables({ ...base, fontSize: size })["--line-height"],
    );
    assert.ok(Math.abs(ratio * size - linux) < 1e-4, `${size}px ratio`);
  }
  assert.equal(
    fontVariables({ ...base, fontSize: 14 })["--line-height"],
    "1.357143",
  );
  // Multipliers and pixels are rounded to whole pixels, at least 8.
  assert.equal(lineHeightPixels(1.6, 14, false), 22);
  assert.equal(lineHeightPixels(26, 16, false), 26);
  assert.equal(lineHeightPixels(0, 5, false), 8);
  assert.equal(lineHeightPixels(1, 6, false), 8);
  assert.equal(
    fontVariables({ ...base, fontSize: 16, lineHeight: 26 })["--line-height"],
    "1.625",
  );
  assert.equal(
    fontVariables({ ...base, lineHeight: 1.6 })["--line-height"],
    "1.625", // 1.6 × 16 = 25.6px, a whole 26px
  );
});

test("size, weight, spacing, ligatures and variations map like the text editor", () => {
  const vars = fontVariables({
    ...base,
    fontSize: 200,
    fontWeight: "bold",
    letterSpacing: 40,
    fontLigatures: "'ss01', 'cv02'",
    fontVariations: true,
  });
  assert.equal(vars["--text-size"], "48px");
  assert.equal(vars["--text-weight"], "bold");
  assert.equal(vars["--text-letter-spacing"], "20px");
  assert.equal(vars["--text-features"], "'ss01', 'cv02'");
  assert.equal(vars["--text-variations"], '"wght" 700');
  assert.equal(fontVariables({ ...base, fontSize: 3 })["--text-size"], "8px");
  assert.equal(
    fontVariables({ ...base, fontLigatures: true })["--text-features"],
    '"liga" on, "calt" on',
  );
  assert.equal(
    fontVariables({ ...base, fontVariations: '"wdth" 80' })[
      "--text-variations"
    ],
    '"wdth" 80',
  );
  assert.equal(
    fontVariables({ ...base, fontWeight: "heavy" })["--text-weight"],
    undefined,
  );
});

test("fontSize is the note's own setting: 16 by default, 8 to 48, wrong values fall back", () => {
  assert.equal(fontSize.parse(undefined), 16);
  assert.equal(fontSize.parse(20), 20);
  assert.equal(fontSize.parse(8), 8);
  assert.equal(fontSize.parse(48), 48);
  for (const bad of [7, 49, -1, "big", null, Number.NaN]) {
    assert.equal(fontSize.parse(bad), 16, String(bad));
  }
  assert.deepEqual(
    { ...fontSize.toJSONSchema(), description: undefined },
    {
      type: "number",
      minimum: 8,
      maximum: 48,
      default: 16,
      description: undefined,
    },
  );
});

test("the size scales the line height ratio's pixels, not the ratio", () => {
  for (const size of [8, 12, 16, 24, 48]) {
    const ratio = Number(
      fontVariables({ ...base, fontSize: size })["--line-height"],
    );
    assert.ok(
      Math.abs(ratio * size - lineHeightPixels(0, size, false)) < 1e-4,
      `${size}px`,
    );
  }
});
