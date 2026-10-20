import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { browserAdaptor } from "@mathjax/src/cjs/adaptors/browserAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import "@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/cjs/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/cjs/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/cjs/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/cjs/input/tex/noundefined/NoUndefinedConfiguration.js";
import "@mathjax/src/cjs/input/tex/configmacros/ConfigMacrosConfiguration.js";
import { loadDynamicFont } from "./fonts";
import { macrosEqual, normalizeMacros, type MathMacro } from "./macros";

const PACKAGES = [
  "base",
  "ams",
  "newcommand",
  "mathtools",
  "cancel",
  "color",
  "noundefined",
  "configmacros",
] as const;

// Without a loader, a formula that needs one of the font's dynamic files
// (\mathbb, \ell, …) fails with "dynamic file … failed to load".
mathjax.asyncLoad = loadDynamicFont;
const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);

let userMacros: Record<string, MathMacro> = {};
let formulas = createFormulas(userMacros);

function createFormulas(macros: Record<string, MathMacro>) {
  return mathjax.document(document, {
    InputJax: new TeX({
      packages: [...PACKAGES],
      macros,
    }),
    OutputJax: new SVG({ fontCache: "local" }),
  });
}

/** Apply Obsidian-style MathJax macros; rebuilds the TeX input jax when they change. */
export function setUserMacros(raw: Record<string, string> | undefined): void {
  const next = normalizeMacros(raw);
  if (macrosEqual(userMacros, next)) {
    return;
  }
  userMacros = next;
  formulas = createFormulas(userMacros);
}

export async function typeset(
  expression: string,
  display: boolean,
): Promise<string> {
  const result = (await formulas.convertPromise(expression, {
    display,
    em: 16,
    ex: 8,
    containerWidth: 704,
  })) as HTMLElement;
  // MathJax draws TeX errors as a box whose text needs its own stylesheet;
  // report them instead, so the caller shows the source and the message.
  const error = result.querySelector("[data-mjx-error]");
  if (error) {
    throw new Error(error.getAttribute("data-mjx-error") ?? "TeX error");
  }
  return adaptor.outerHTML(result);
}
