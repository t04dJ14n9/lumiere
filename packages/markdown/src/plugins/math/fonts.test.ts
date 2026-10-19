import test from "node:test";
import assert from "node:assert/strict";
import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { liteAdaptor } from "@mathjax/src/cjs/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import type { DynamicFile } from "@mathjax/src/cjs/output/common/FontData.js";
import "@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/cjs/svg.js";
import { loadDynamicFont } from "./fonts";

/** The font's dynamic files, each with the path MathJax asks for it by. */
class DynamicFonts extends MathJaxNewcmFont {
  static list(): { file: DynamicFile; path: string }[] {
    const font = new DynamicFonts();
    return Object.values(this.dynamicFiles).map((file) => ({
      file,
      path: font.dynamicFileName(file),
    }));
  }
}

// Runs before any font file is imported: MathJax applies a file another test
// imported even when it has no loader, so this would pass without one.
test("formulas that need the font's dynamic files typeset offline with their own glyphs", async () => {
  mathjax.asyncLoad = loadDynamicFont;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const formulas = mathjax.document("", {
    InputJax: new TeX({ packages: ["base", "ams"] }),
    OutputJax: new SVG({ fontCache: "local" }),
  });
  // Each formula and the glyph it draws: the font's variant and code point.
  for (const [tex, glyph] of [
    ["\\mathbb{R}", "DS-211D"],
    ["\\mathbb{E}", "DS-1D53C"],
    ["\\mathfrak{g}", "F-1D524"],
    ["\\mathscr{L}", "S-2112"],
    // Without its file, \mathcal quietly drew a math italic L (C-1D43F).
    ["\\mathcal{L}", "C-4C"],
    ["\\mathsf{T}", "SS-1D5B3"],
    ["\\mathtt{x}", "M-1D6A1"],
    ["\\ell_2", "I-2113"],
    ["a \\perp b", "N-27C2"],
    ["x \\leadsto y", "N-21DD"],
    ["\\checkmark", "I-2713"],
    // Without its file, é was drawn as text in a system font.
    ["\\text{é}", "N-E9"],
  ] as const) {
    const svg = adaptor.outerHTML(
      await formulas.convertPromise(tex, { display: false }),
    );
    assert.match(svg, new RegExp(`id="MJX-\\d+-NCM-${glyph}"`), tex);
  }
});

test("every dynamic file of the newcm font is bundled and registers its glyphs", async () => {
  const files = DynamicFonts.list();
  assert.ok(files.length > 0);
  const font = new DynamicFonts();
  for (const { file, path } of files) {
    await loadDynamicFont(path);
    // Until its data loads, a file's setup only marks it as failed.
    file.setup(font);
    assert.equal(file.failed, false, `${file.file} registers its glyphs`);
  }
});

test("a file MathJax asks for that is not a bundled font file is refused", async () => {
  for (const path of [
    "@mathjax/mathjax-newcm-font/js/svg/dynamic/missing.js",
    "[tex]/physics",
  ]) {
    await assert.rejects(loadDynamicFont(path), /not bundled/);
  }
});
