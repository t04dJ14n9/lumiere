import test from "node:test";
import assert from "node:assert/strict";
import { fontSize, fontVariables, lineHeight } from "./font";
import type { FontSettings } from "./font";

const base: FontSettings = {
  fontFamily: "",
  fontSize: 16,
  fontWeight: "normal",
  lineHeight: 1.5,
  letterSpacing: 0,
  fontLigatures: false,
  fontVariations: false,
};

test("without host settings the size is Obsidian's 16px and VS Code's ligature and variation defaults apply", () => {
  assert.deepEqual(fontVariables(base), {
    "--text-size": "16px",
    "--text-weight": "normal",
    "--line-height": "1.5",
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

test("line height is a multiple of the size, Obsidian's 1.5 by default", () => {
  assert.equal(fontVariables(base)["--line-height"], "1.5");
  assert.equal(
    fontVariables({ ...base, lineHeight: 1.8 })["--line-height"],
    "1.8",
  );
  // The ratio does not depend on the size, so the lines scale with it.
  for (const size of [8, 12, 16, 24, 48]) {
    assert.equal(
      fontVariables({ ...base, fontSize: size })["--line-height"],
      "1.5",
      `${size}px`,
    );
  }
  assert.equal(
    fontVariables({ ...base, lineHeight: 0.2 })["--line-height"],
    "1",
  );
  assert.equal(fontVariables({ ...base, lineHeight: 9 })["--line-height"], "3");
  assert.equal(lineHeight.parse(undefined), 1.5);
  assert.equal(lineHeight.parse(1), 1);
  assert.equal(lineHeight.parse(3), 3);
  // A pixel value for editor.lineHeight is no multiplier: invalid, so the default.
  for (const bad of [0, 0.9, 3.1, 24, "tall", null, Number.NaN]) {
    assert.equal(lineHeight.parse(bad), 1.5, String(bad));
  }
  assert.deepEqual(
    { ...lineHeight.toJSONSchema(), description: undefined },
    {
      type: "number",
      minimum: 1,
      maximum: 3,
      default: 1.5,
      description: undefined,
    },
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
