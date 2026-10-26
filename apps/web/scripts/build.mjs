// Builds Lumière for the web into dist/: a static site any web server can
// host, under any path.
//   index.html, app.js, shell.css   the window and host-web (src/main.ts)
//   markdown/, page/shim.js          the editor and its page shim (host-node's assets)
//   contributed.json, menus.json     Lumière's settings and right-click menu
//   workers/*.web.js                 the vault and search workers, for a browser
//   manifest.webmanifest, sw.js      installing, and working offline
//
// Usage: node scripts/build.mjs [--production]
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { buildHostAssets } from "../../../packages/host-node/scripts/assets.mjs";

const production = process.argv.includes("--production");
const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const root = path.resolve(here, "../..");
const out = path.join(here, "dist");
const browser = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  sourcemap: !production,
  minify: production,
  legalComments: "none",
  logLevel: "info",
};

await rm(out, { recursive: true, force: true });
const { version } = await buildHostAssets({ out, production });
await esbuild.build({
  ...browser,
  entryPoints: [path.join(here, "src/main.ts")],
  outfile: path.join(out, "app.js"),
  format: "esm",
  jsx: "automatic",
  define: { LUMIERE_VERSION: JSON.stringify(version) },
});
for (const name of ["vault", "search"]) {
  await esbuild.build({
    ...browser,
    entryPoints: [
      path.join(root, `packages/markdown/src/workers/${name}.web.ts`),
    ],
    outfile: path.join(out, "workers", `${name}.web.js`),
    format: "iife",
  });
}
await cp(path.join(here, "index.html"), path.join(out, "index.html"));
await cp(
  path.join(root, "packages/app/src/shell/styles.css"),
  path.join(out, "shell.css"),
);
await cp(path.join(here, "public"), out, { recursive: true });
await writeServiceWorker(out);
console.log(`Built ${path.relative(root, out)}`);

/** The service worker, with this build's files to cache (not source maps). */
async function writeServiceWorker(folder) {
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
