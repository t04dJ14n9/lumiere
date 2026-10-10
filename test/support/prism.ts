import { build, type Plugin } from "esbuild";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type Prism from "prismjs";
import type * as highlighter from "../../src/plugins/codeBlocks/code-highlight";

export interface PrismFixture {
  Prism: typeof Prism;
  highlighter?: typeof highlighter;
}

/** Isolated globals keep the eager reference from preloading the lazy fixture. */
export async function prismFixture(lazy: boolean) {
  const pluginUrl = pathToFileURL(`${process.cwd()}/scripts/prism.mjs`).href;
  const { prismPlugin } = (await import(pluginUrl)) as { prismPlugin: Plugin };
  const contents = lazy
    ? 'export { default as Prism } from "prism-languages"; export * as highlighter from "./src/plugins/codeBlocks/code-highlight";'
    : 'export { default as Prism } from "prism-all-languages";';
  const result = await build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    format: "cjs",
    platform: "browser",
    write: false,
    plugins: [prismPlugin],
  });
  const code = result.outputFiles[0]!.text;
  return () => {
    const scope = { module: { exports: {} }, global: {} };
    scope.global = scope;
    runInNewContext(code, scope);
    return scope.module.exports as PrismFixture;
  };
}

/** Check the same ESM splitting used by the webview, without launching a browser. */
export async function splitPrismFixture() {
  const directory = await mkdtemp(join(tmpdir(), "mdwb-prism-"));
  const pluginUrl = pathToFileURL(`${process.cwd()}/scripts/prism.mjs`).href;
  const { prismPlugin } = (await import(pluginUrl)) as { prismPlugin: Plugin };
  const previousPrism = (globalThis as { Prism?: typeof Prism }).Prism;
  const dispose = async () => {
    const global = globalThis as { Prism?: typeof Prism };
    if (previousPrism) {
      global.Prism = previousPrism;
    } else {
      delete global.Prism;
    }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const result = await build({
      stdin: {
        contents:
          'export { default as Prism } from "prism-languages"; export * as highlighter from "./src/plugins/codeBlocks/code-highlight";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      splitting: true,
      platform: "browser",
      outdir: directory,
      outExtension: { ".js": ".mjs" },
      metafile: true,
      plugins: [prismPlugin],
    });
    const entry = Object.entries(result.metafile.outputs).find(
      ([, info]) => info.entryPoint === "<stdin>",
    )?.[0];
    if (!entry) {
      throw new Error("Missing Prism entry");
    }
    const fixture = (await import(
      pathToFileURL(resolve(entry)).href
    )) as PrismFixture;
    return { ...fixture, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
