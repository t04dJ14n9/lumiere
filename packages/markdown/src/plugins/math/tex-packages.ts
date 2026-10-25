/**
 * Side-effect imports register TeX packages with MathJax. Without them,
 * `packages: [...]` in `new TeX(...)` logs "Package '…' not found. Omitted."
 * and options those packages define (notably `macros` from configmacros) are
 * rejected as "Invalid option … (no default value)".
 *
 * Safe at module load in Node — these do not touch `window`/`document`.
 */
import "@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/cjs/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/cjs/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/cjs/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/cjs/input/tex/noundefined/NoUndefinedConfiguration.js";
import "@mathjax/src/cjs/input/tex/configmacros/ConfigMacrosConfiguration.js";

export const TEX_PACKAGES = [
  "base",
  "ams",
  "newcommand",
  "mathtools",
  "cancel",
  "color",
  "noundefined",
  "configmacros",
] as const;
