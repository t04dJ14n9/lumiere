import assert from "node:assert/strict";
import test from "node:test";
import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { liteAdaptor } from "@mathjax/src/cjs/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import { macrosEqual, normalizeMacros } from "./macros";
import { config } from "./manifest";
// Same registration as production mathjax.ts — catches dropped side-effect imports.
import { TEX_PACKAGES } from "./tex-packages";

test("normalizeMacros keeps TeX names and derives argument counts from #n", () => {
  assert.deepEqual(
    normalizeMacros({
      RR: "{\\bf R}",
      dd: "{\\mathrm{d}#1}",
      binom: "{\\frac{#1}{#2}}",
      "1bad": "x",
      "": "y",
      ok: "",
      long: "x".repeat(5000),
    }),
    {
      RR: "{\\bf R}",
      dd: ["{\\mathrm{d}#1}", 1],
      binom: ["{\\frac{#1}{#2}}", 2],
    },
  );
  assert.equal(
    macrosEqual(normalizeMacros({ a: "1" }), normalizeMacros({ a: "1" })),
    true,
  );
  assert.equal(
    macrosEqual(normalizeMacros({ a: "1" }), normalizeMacros({ a: "2" })),
    false,
  );
});

test("math.macros setting defaults to an empty map", () => {
  assert.deepEqual(config.parse({}), { macros: {} });
  assert.deepEqual(config.parse({ macros: { RR: "{\\bf R}" } }), {
    macros: { RR: "{\\bf R}" },
  });
  assert.throws(() => config.parse({ macros: { RR: "x".repeat(5000) } }));
});

test("configmacros expands normalized user macros", async () => {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const macros = normalizeMacros({
    RR: "{\\bf R}",
    dd: "{\\mathrm{d}#1}",
  });
  const formulas = mathjax.document("", {
    InputJax: new TeX({
      packages: [...TEX_PACKAGES],
      macros,
    }),
    OutputJax: new SVG({ fontCache: "local" }),
  });
  for (const tex of ["\\RR", "\\dd{x}"]) {
    const svg = adaptor.outerHTML(
      await formulas.convertPromise(tex, { display: false }),
    );
    assert.equal(/data-mjx-error/.test(svg), false, tex);
    assert.match(svg, /svg/i);
  }
});

test("TEX_PACKAGES registers configmacros so TeX accepts macros option", () => {
  // Mirrors Host GUI: without ConfigMacrosConfiguration, MathJax logs
  // `Invalid option "macros" (no default value)` and user macros never apply.
  const warnings: string[] = [];
  const prev = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const jax = new TeX({
      packages: [...TEX_PACKAGES],
      macros: { RR: "{\\bf R}", dd: ["{\\mathrm{d}#1}", 1] },
    });
    assert.ok(jax);
  } finally {
    console.warn = prev;
  }
  assert.equal(
    warnings.some((w) => /Invalid option ["']macros["']/i.test(w)),
    false,
    `unexpected MathJax macros warning: ${warnings.join(" | ")}`,
  );
  assert.equal(
    warnings.some((w) => /Package '.*(ams|newcommand|mathtools|configmacros).*' not found/i.test(w)),
    false,
    `unexpected missing package warning: ${warnings.join(" | ")}`,
  );
});
