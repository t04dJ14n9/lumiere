// Builds Lumière for the web into dist/: a static site any web server can
// host, under any path. The page and its parts are host-web's
// (packages/host-web/scripts/bundle.mjs); this adds installing and offline:
//   manifest.webmanifest, icon.svg   from public/
//   sw.js                            the service worker (src/worker/sw.ts)
//
// Usage: node scripts/build.mjs [--production]
import { cp, readdir } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { buildBrowserApp } from "../../../packages/host-web/scripts/bundle.mjs";

const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(here, "dist");
const production = process.argv.includes("--production");
const { version } = await buildBrowserApp({
  entry: path.join(here, "src/main.ts"),
  html: path.join(here, "index.html"),
  out,
  production,
});
await cp(path.join(here, "public"), out, { recursive: true });
await buildServiceWorker({ out, version, production });
console.log(`Built ${path.relative(path.resolve(here, "../.."), out)}`);

/**
 * The service worker, built last: it caches every other file of this build
 * (not source maps), and names its cache after the build.
 */
async function buildServiceWorker({ out, version, production }) {
  const files = (await readdir(out, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".map"))
    .map((entry) =>
      path
        .relative(out, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
  await esbuild.build({
    entryPoints: [path.join(here, "src/worker/sw.ts")],
    outfile: path.join(out, "sw.js"),
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
    sourcemap: !production,
    minify: production,
    legalComments: "none",
    logLevel: "info",
    define: {
      LUMIERE_BUILD: JSON.stringify(`lumiere-${version}-${Date.now()}`),
      LUMIERE_FILES: JSON.stringify(["./", ...files]),
    },
  });
}
