import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
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

let userMacros: Record<string, MathMacro> = {};
let formulas: ReturnType<typeof createFormulas> | undefined;
let adaptor: { outerHTML(node: unknown): string } | undefined;
let browserReady: Promise<void> | undefined;

function createFormulas(macros: Record<string, MathMacro>) {
  return mathjax.document(document, {
    InputJax: new TeX({
      packages: [...PACKAGES],
      macros,
    }),
    OutputJax: new SVG({ fontCache: "local" }),
  });
}

/** esbuild code-splitting emits MathJax CJS as `export default <exports>` only. */
function cjsNamed<T>(mod: Record<string, unknown>, name: string): T {
  const direct = mod[name];
  if (typeof direct === "function") {
    return direct as T;
  }
  const def = mod.default;
  if (def && typeof def === "object") {
    const nested = (def as Record<string, unknown>)[name];
    if (typeof nested === "function") {
      return nested as T;
    }
  }
  if (typeof def === "function") {
    return def as T;
  }
  throw new TypeError(`MathJax ${name} is not a function`);
}

async function ensureBrowser(): Promise<void> {
  if (formulas && adaptor) {
    return;
  }
  browserReady ??= (async () => {
    // browserAdaptor needs `window`/`document` — only load in a real webview,
    // never at module import (Node unit tests import this graph).
    // Dynamic import + esbuild splitting yields default-export-only chunks;
    // named destructuring leaves `browserAdaptor` undefined → "n is not a function".
    const browserMod = await import(
      "@mathjax/src/cjs/adaptors/browserAdaptor.js"
    );
    const htmlMod = await import("@mathjax/src/cjs/handlers/html.js");
    const browserAdaptor = cjsNamed<() => unknown>(
      browserMod as Record<string, unknown>,
      "browserAdaptor",
    );
    const RegisterHTMLHandler = cjsNamed<(a: unknown) => void>(
      htmlMod as Record<string, unknown>,
      "RegisterHTMLHandler",
    );
    const a = browserAdaptor();
    RegisterHTMLHandler(a);
    adaptor = a as { outerHTML(node: unknown): string };
    formulas = createFormulas(userMacros);
  })();
  await browserReady;
}

/** Apply Obsidian-style MathJax macros; rebuilds the TeX input jax when they change. */
export function setUserMacros(raw: Record<string, string> | undefined): void {
  const next = normalizeMacros(raw);
  if (macrosEqual(userMacros, next)) {
    return;
  }
  userMacros = next;
  if (formulas && adaptor) {
    formulas = createFormulas(userMacros);
  }
}

export async function typeset(
  expression: string,
  display: boolean,
): Promise<string> {
  await ensureBrowser();
  const result = (await formulas!.convertPromise(expression, {
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
  return adaptor!.outerHTML(result);
}
