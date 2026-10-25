import type * as Yaml from "yaml";

let cached: typeof Yaml | undefined;

/** Node's require; declared locally so webview tsconfig (no @types/node) still checks. */
declare function require(id: string): unknown;

/**
 * YAML runtime, loaded on the first parse of a `---` fence. Notes with no
 * frontmatter never touch it. The extension-host build keeps `yaml` in a
 * separate chunk (`yaml-runtime.cjs`) so activation does not evaluate it.
 */
export function loadYaml(): typeof Yaml {
  // Host: esbuild rewrites this to require("./markdown/yaml-runtime.cjs").
  // Workers / webview: bundler inlines the package into the chunk.
  return (cached ??= require("yaml") as typeof Yaml);
}
