import test from "node:test";
import assert from "node:assert/strict";
import { fontVariables, lineHeightPixels } from "./font";
import type { FontSettings } from "./font";

const base: FontSettings = {
  fontFamily: "",
  defaultFontFamily: "",
  fontSize: 0,
  fontWeight: "normal",
  lineHeight: 0,
  letterSpacing: 0,
  fontLigatures: false,
  fontVariations: false,
};

test("without host settings only VS Code's ligature and variation defaults apply", () => {
  assert.deepEqual(fontVariables(base), {
    "--text-weight": "normal",
    "--text-features": '"liga" off, "calt" off',
    "--text-variations": "normal",
  });
});

test("the family is followed by the platform's default list, as VS Code's getMassagedFontFamily", () => {
  const linux = "'Droid Sans Mono', 'monospace', monospace";
  const vars = fontVariables({
    ...base,
    fontFamily: "'JetBrains Mono', Menlo",
  });
  assert.equal(vars["--text-font"], `'JetBrains Mono', Menlo, ${linux}`);
  assert.equal(vars["--code-font"], vars["--text-font"]);
  // A single name with spaces is quoted; one without is left alone.
  assert.equal(
    fontVariables({ ...base, fontFamily: "DejaVu Sans Mono" })["--text-font"],
    `"DejaVu Sans Mono", ${linux}`,
  );
  assert.equal(
    fontVariables({ ...base, fontFamily: "Menlo" })["--text-font"],
    `Menlo, ${linux}`,
  );
  // The list ends in a generic family, and VS Code still appends its own.
  assert.equal(
    fontVariables({ ...base, fontFamily: "Fira Code, monospace" })[
      "--text-font"
    ],
    `Fira Code, monospace, ${linux}`,
  );
  // The default list itself is not repeated.
  assert.equal(
    fontVariables({ ...base, fontFamily: linux })["--text-font"],
    linux,
  );
  assert.equal(
    fontVariables({ ...base, fontFamily: "Fira Code" }, "mac")["--text-font"],
    `"Fira Code", Menlo, Monaco, 'Courier New', monospace`,
  );
  assert.equal(
    fontVariables({ ...base, fontFamily: "Fira Code" }, "windows")[
      "--text-font"
    ],
    `"Fira Code", Consolas, 'Courier New', monospace`,
  );
  // A value cannot end the declaration and add others.
  assert.equal(
    fontVariables({ ...base, fontFamily: "A; color: red" })["--text-font"],
    `"A color: red", ${linux}`,
  );
});

test("the host's own default list is used when it reports one", () => {
  // VS Code 1.9x reports 'Droid Sans Mono', monospace on Linux.
  const defaultFontFamily = "'Droid Sans Mono', monospace";
  assert.equal(
    fontVariables({ ...base, defaultFontFamily, fontFamily: "Fira Code" })[
      "--text-font"
    ],
    `"Fira Code", ${defaultFontFamily}`,
  );
  // The unset setting reaches the note as the default itself: no repeat.
  assert.equal(
    fontVariables({
      ...base,
      defaultFontFamily,
      fontFamily: defaultFontFamily,
    })["--text-font"],
    defaultFontFamily,
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
    String(19 / 14),
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
  // Without a known size (no host), only a multiplier can apply.
  assert.equal(fontVariables(base)["--line-height"], undefined);
  assert.equal(
    fontVariables({ ...base, lineHeight: 1.6 })["--line-height"],
    "1.6",
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
  assert.equal(vars["--text-size"], "100px");
  assert.equal(vars["--text-weight"], "bold");
  assert.equal(vars["--text-letter-spacing"], "20px");
  assert.equal(vars["--text-features"], "'ss01', 'cv02'");
  assert.equal(vars["--text-variations"], '"wght" 700');
  assert.equal(fontVariables({ ...base, fontSize: 3 })["--text-size"], "6px");
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
