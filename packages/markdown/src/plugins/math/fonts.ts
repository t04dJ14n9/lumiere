/**
 * The newcm font keeps many glyphs out of the font itself and has MathJax
 * load them on first use: \mathbb, \mathfrak, \mathscr, \mathcal, \mathsf,
 * \mathtt, \ell, \wp, \Re, many AMS relations and arrows, and letters beyond
 * ASCII in \text. MathJax asks for each file through `mathjax.asyncLoad`.
 * Every file here is its own chunk of the webview bundle, so formulas work
 * offline and a file loads only when a formula needs it.
 *
 * The paths name the CommonJS build on purpose: each file registers its
 * glyphs with the font class it imports, which must be the one the SVG
 * output already uses (`@mathjax/src/cjs`).
 */
const DYNAMIC_FONT_FILES = new Map<string, () => Promise<unknown>>([
  [
    "accents",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/accents.js"),
  ],
  [
    "accents-b-i",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/accents-b-i.js"),
  ],
  [
    "arabic",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/arabic.js"),
  ],
  [
    "arrows",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/arrows.js"),
  ],
  [
    "braille",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/braille.js"),
  ],
  [
    "braille-d",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/braille-d.js"),
  ],
  [
    "calligraphic",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/calligraphic.js"),
  ],
  [
    "cherokee",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/cherokee.js"),
  ],
  [
    "cyrillic",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/cyrillic.js"),
  ],
  [
    "cyrillic-ss",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/cyrillic-ss.js"),
  ],
  [
    "devanagari",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/devanagari.js"),
  ],
  [
    "double-struck",
    () =>
      import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/double-struck.js"),
  ],
  [
    "fraktur",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/fraktur.js"),
  ],
  [
    "greek",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/greek.js"),
  ],
  [
    "greek-ss",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/greek-ss.js"),
  ],
  [
    "hebrew",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/hebrew.js"),
  ],
  [
    "latin",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin.js"),
  ],
  [
    "latin-b",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin-b.js"),
  ],
  [
    "latin-bi",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin-bi.js"),
  ],
  [
    "latin-i",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin-i.js"),
  ],
  [
    "marrows",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/marrows.js"),
  ],
  ["math", () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/math.js")],
  [
    "monospace",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/monospace.js"),
  ],
  [
    "monospace-ex",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/monospace-ex.js"),
  ],
  [
    "monospace-l",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/monospace-l.js"),
  ],
  [
    "mshapes",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/mshapes.js"),
  ],
  [
    "phonetics",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/phonetics.js"),
  ],
  [
    "phonetics-ss",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/phonetics-ss.js"),
  ],
  ["PUA", () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/PUA.js")],
  [
    "sans-serif",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif.js"),
  ],
  [
    "sans-serif-b",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif-b.js"),
  ],
  [
    "sans-serif-bi",
    () =>
      import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif-bi.js"),
  ],
  [
    "sans-serif-ex",
    () =>
      import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif-ex.js"),
  ],
  [
    "sans-serif-i",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif-i.js"),
  ],
  [
    "sans-serif-r",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif-r.js"),
  ],
  [
    "script",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/script.js"),
  ],
  [
    "shapes",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/shapes.js"),
  ],
  [
    "symbols",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/symbols.js"),
  ],
  [
    "symbols-b-i",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/symbols-b-i.js"),
  ],
  [
    "variants",
    () => import("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/variants.js"),
  ],
]);

/** MathJax's `asyncLoad`: the bundled dynamic font file at `path`. */
export function loadDynamicFont(path: string): Promise<unknown> {
  const name = /\/svg\/dynamic\/([\w-]+)\.js$/.exec(path)?.[1];
  const load = name === undefined ? undefined : DYNAMIC_FONT_FILES.get(name);
  if (!load) {
    return Promise.reject(
      new Error(`MathJax asked for ${path}, which is not bundled`),
    );
  }
  return load();
}
