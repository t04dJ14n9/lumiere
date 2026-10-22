import type * as Yaml from "yaml";

let cached: typeof Yaml | undefined;
let loading: Promise<typeof Yaml> | undefined;

/** Node's require; declared locally so webview tsconfig (no @types/node) still checks. */
declare function require(id: string): unknown;

/**
 * Set `true` by the webview esbuild `define`. Host / worker / unit builds leave
 * it unset so the sync `require("yaml")` path stays reachable (host: rewritten
 * to `yaml-runtime.cjs` by the lazy-yaml plugin).
 */
declare const __LUMIERE_WEBVIEW__: boolean | undefined;

/**
 * Start fetching / evaluating the YAML package without blocking the editor
 * entry. Await before Live Preview `metadata()` / Properties paint.
 */
export function preloadYaml(): Promise<typeof Yaml> {
  if (cached) {
    return Promise.resolve(cached);
  }
  loading ??= import("yaml").then((mod) => {
    cached = mod;
    return mod;
  });
  return loading;
}

/**
 * YAML runtime. Host: sync `require` of the separate `yaml-runtime.cjs` chunk
 * on the first `---` fence. Webview: dynamic `import("yaml")` via
 * {@link preloadYaml} so the ~104 KB package is not fused into the editor
 * static graph (Live Preview metadata used to pull it in via `require`).
 * A post-build strip removes esbuild's unused static edge beside that dynamic
 * import (see `strip-dead-yaml-static.mjs`).
 */
export function loadYaml(): typeof Yaml {
  if (cached) {
    return cached;
  }
  // Webview builds define this true; the require branch is DCE'd so `yaml`
  // stays out of the editor / Properties static import graph.
  if (typeof __LUMIERE_WEBVIEW__ !== "undefined" && __LUMIERE_WEBVIEW__) {
    throw new Error("YAML runtime not loaded; await preloadYaml() first");
  }
  // Host: esbuild rewrites this to require("./markdown/yaml-runtime.cjs").
  return (cached ??= require("yaml") as typeof Yaml);
}
