// Builds Lumière for the web into dist/: a static site any web server can
// host, under any path. The page and its parts are host-web's
// (packages/host-web/scripts/bundle.mjs); this adds installing and offline:
//   manifest.webmanifest, icon.svg, sw.js
//
// Usage: node scripts/build.mjs [--production]
import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBrowserApp } from "../../../packages/host-web/scripts/bundle.mjs";

const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(here, "dist");
const { version } = await buildBrowserApp({
  entry: path.join(here, "src/main.ts"),
  html: path.join(here, "index.html"),
  out,
  production: process.argv.includes("--production"),
});
await cp(path.join(here, "public"), out, { recursive: true });
await writeServiceWorker(out, version);
console.log(`Built ${path.relative(path.resolve(here, "../.."), out)}`);

/** The service worker, with this build's files to cache (not source maps). */
async function writeServiceWorker(folder, version) {
  const files = (
    await readdir(folder, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".map"))
    .map((entry) =>
      path
        .relative(folder, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .filter((file) => file !== "sw.js")
    .sort();
  const worker = path.join(folder, "sw.js");
  const source = await readFile(worker, "utf8");
  await writeFile(
    worker,
    source
      .replace(
        '"__BUILD__"',
        JSON.stringify(`lumiere-${version}-${Date.now()}`),
      )
      .replace(
        "const FILES = [];",
        `const FILES = ${JSON.stringify(["./", ...files])};`,
      ),
  );
}
