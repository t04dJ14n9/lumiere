import test from "node:test";
import assert from "node:assert/strict";
import { fontVariables } from "./font";
import type { FontSettings } from "./font";

const base: FontSettings = {
  fontFamily: "",
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

test("line height follows VS Code: 0 keeps 1.5, below 8 multiplies, otherwise pixels", () => {
  assert.equal(
    fontVariables({ ...base, fontSize: 14 })["--line-height"],
    undefined,
  );
  assert.equal(
    fontVariables({ ...base, fontSize: 14, lineHeight: 1.6 })["--line-height"],
    "1.6",
  );
  assert.equal(
    fontVariables({ ...base, fontSize: 16, lineHeight: 26 })["--line-height"],
    "1.625",
  );
  // Pixels need a known size.
  assert.equal(
    fontVariables({ ...base, lineHeight: 26 })["--line-height"],
    undefined,
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
