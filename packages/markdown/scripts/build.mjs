import { prismPlugin } from "./prism.mjs";
// Builds Lumière's assets into this package's dist/: the editor,
// diff and graph webviews, the vault and search workers, and the public API
// declarations. The extension host is bundled by the repository root
// (scripts/build.mjs there), which copies this dist/ into dist/markdown/.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url);
const watch = process.argv.includes("--watch");
const shared = {
  bundle: true,
  sourcemap: true,
  minify: process.argv.includes("--production"),
  logLevel: "info",
  metafile: true,
};
await rm("dist", { recursive: true, force: true });
execFileSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.api.json"],
  { stdio: "inherit" },
);
const builds = [
  {
    ...shared,
    entryPoints: {
      editor: "src/webview/main.ts",
      diff: "src/webview/diff/main.ts",
      graph: "src/webview/graph/main.ts",
      "graph-layout": "src/webview/graph/layout-worker.ts",
    },
    outdir: "dist/webview",
    platform: "browser",
    format: "esm",
    splitting: true,
    target: "chrome120",
    plugins: [prismPlugin],
  },
  {
    ...shared,
    entryPoints: ["src/workers/vault.ts", "src/workers/search.ts"],
    outdir: "dist/workers",
    outExtension: { ".js": ".cjs" },
    platform: "node",
    format: "cjs",
    target: "node20",
  },
];
const inputs = new Set();
for (const options of builds) {
  if (watch) {
    await (await esbuild.context(options)).watch();
  } else {
    const result = await esbuild.build(options);
    for (const input of Object.keys(result.metafile.inputs)) {
      inputs.add(input);
    }
  }
}
// Every bundled source file; scripts/third-party-notices.mjs reads it.
if (!watch) {
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/bundle-inputs.json",
    JSON.stringify([...inputs].sort(), null, 1),
  );
}
