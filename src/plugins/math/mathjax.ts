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

const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);
const formulas = mathjax.document(document, {
  InputJax: new TeX({
    packages: [
      "base",
      "ams",
      "newcommand",
      "mathtools",
      "cancel",
      "color",
      "noundefined",
    ],
  }),
  OutputJax: new SVG({ fontCache: "local" }),
});
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
  return adaptor.outerHTML(result);
}
