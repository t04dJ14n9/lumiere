import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { loadDynamicFont } from "./fonts";
import { macrosEqual, normalizeMacros, type MathMacro } from "./macros";
import { TEX_PACKAGES } from "./tex-packages";

// Without a loader, a formula that needs one of the font's dynamic files
// (\mathbb, \ell, …) fails with "dynamic file … failed to load".
mathjax.asyncLoad = loadDynamicFont;

const MATH_CACHE_LIMIT = 256;
const mathCache = new Map<string, string>();

let userMacros: Record<string, MathMacro> = {};
let macrosKey = "{}";
let formulas: ReturnType<typeof createFormulas> | undefined;
let adaptor: { outerHTML(node: unknown): string } | undefined;
let browserReady: Promise<void> | undefined;
let asyncConversionsInFlight = 0;

function cacheKey(expression: string, display: boolean): string {
  return `${display ? 1 : 0}\0${macrosKey}\0${expression}`;
}

function getCachedMath(key: string): string | undefined {
  const cached = mathCache.get(key);
  if (cached !== undefined) {
    mathCache.delete(key);
    mathCache.set(key, cached);
  }
  return cached;
}

function setCachedMath(key: string, html: string): void {
  if (mathCache.has(key)) {
    mathCache.delete(key);
  } else if (mathCache.size >= MATH_CACHE_LIMIT) {
    const oldest = mathCache.keys().next().value;
    if (oldest !== undefined) {
      mathCache.delete(oldest);
    }
  }
  mathCache.set(key, html);
}

/** Drop cached SVG HTML entries (used in unit tests). */
export function clearMathCache(): void {
  mathCache.clear();
}

function createFormulas(macros: Record<string, MathMacro>) {
  const target = typeof document === "undefined" ? "" : document;
  return mathjax.document(target, {
    InputJax: new TeX({
      packages: [...TEX_PACKAGES],
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

/** Warm the browser HTML handler and MathJax document ahead of scroll mounts. */
export async function ensureBrowser(): Promise<void> {
  if (formulas && adaptor) {
    return;
  }
  browserReady ??= (async () => {
    // browserAdaptor needs `window`/`document` — only load in a real webview,
    // never at module import (Node unit tests import this graph).
    // Dynamic import + esbuild splitting yields default-export-only chunks;
    // named destructuring leaves `browserAdaptor` undefined → "n is not a function".
    const browserMod =
      await import("@mathjax/src/cjs/adaptors/browserAdaptor.js");
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

/** Test hook to supply a non-DOM adaptor (e.g. liteAdaptor in Node unit tests). */
export function setMathAdaptorForTest(
  customAdaptor: { outerHTML(node: unknown): string } | undefined,
): void {
  adaptor = customAdaptor;
  formulas = customAdaptor ? createFormulas(userMacros) : undefined;
  browserReady = customAdaptor ? Promise.resolve() : undefined;
}

/** Apply Obsidian-style MathJax macros; rebuilds the TeX input jax when they change. */
export function setUserMacros(raw: Record<string, string> | undefined): void {
  const next = normalizeMacros(raw);
  if (macrosEqual(userMacros, next)) {
    return;
  }
  userMacros = next;
  macrosKey = JSON.stringify(next);
  if (formulas && adaptor) {
    formulas = createFormulas(userMacros);
  }
}

function checkMathError(result: unknown, html: string): void {
  if (
    result &&
    typeof result === "object" &&
    "querySelector" in result &&
    typeof (result as { querySelector?: unknown }).querySelector === "function"
  ) {
    const error = (result as HTMLElement).querySelector("[data-mjx-error]");
    if (error) {
      throw new Error(error.getAttribute("data-mjx-error") ?? "TeX error");
    }
    return;
  }
  const match = /data-mjx-error="([^"]*)"/.exec(html);
  if (match) {
    throw new Error(match[1] || "TeX error");
  }
}

/**
 * Synchronously convert a TeX expression to MathJax SVG HTML when either the
 * LRU cache hits or MathJax is initialized and no dynamic font chunk retry is
 * required. Returns `undefined` when async initialization/font loading is needed.
 */
export function typesetSync(
  expression: string,
  display: boolean,
): string | undefined {
  const key = cacheKey(expression, display);
  const cached = getCachedMath(key);
  if (cached !== undefined) {
    return cached;
  }
  if (!formulas || !adaptor || asyncConversionsInFlight > 0) {
    return undefined;
  }
  let result: unknown;
  try {
    result = formulas.convert(expression, {
      display,
      em: 16,
      ex: 8,
      containerWidth: 704,
    });
  } catch (error) {
    if (error && typeof error === "object" && "retry" in error) {
      return undefined;
    }
    throw error;
  }
  const html = adaptor.outerHTML(result);
  checkMathError(result, html);
  setCachedMath(key, html);
  return html;
}

export async function typeset(
  expression: string,
  display: boolean,
): Promise<string> {
  const key = cacheKey(expression, display);
  const cached = getCachedMath(key);
  if (cached !== undefined) {
    return cached;
  }
  await ensureBrowser();
  const afterReady = getCachedMath(key);
  if (afterReady !== undefined) {
    return afterReady;
  }
  asyncConversionsInFlight++;
  let result: HTMLElement;
  try {
    result = (await formulas!.convertPromise(expression, {
      display,
      em: 16,
      ex: 8,
      containerWidth: 704,
    })) as HTMLElement;
  } finally {
    asyncConversionsInFlight--;
  }
  const html = adaptor!.outerHTML(result);
  checkMathError(result, html);
  setCachedMath(key, html);
  return html;
}
