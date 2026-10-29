// Builds a page that runs Lumière with host-web (the web app, the iPad app)
// into `out`:
//   index.html, app.js, shell.css   the page, its entry, and the window's styles
//   markdown/, page/shim.js          the editor and its page shim (host-node's assets)
//   contributed.json, menus.json     Lumière's settings and right-click menu
//   workers/*.web.js                 the vault and search workers, for a browser
//   pdf/, page/pdf-shim.js           the PDF viewer and its host's stand-in
// Used by apps/web/scripts/build.mjs and apps/ipad/scripts/build.mjs.
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { buildHostAssets } from "../../host-node/scripts/assets.mjs";
import { copyEngine, viewerBuild } from "../../pdf/scripts/viewer.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);

/**
 * @param {{ entry: string, html: string, out: string, production: boolean }} options
 * @returns {Promise<{ version: string }>}
 */
export async function buildBrowserApp({ entry, html, out, production }) {
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
    entryPoints: [entry],
    outfile: path.join(out, "app.js"),
    format: "esm",
    jsx: "automatic",
    define: { LUMIERE_VERSION: JSON.stringify(version) },
  });
  await buildPdfViewer(browser, { out, production });
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
  await cp(html, path.join(out, "index.html"));
  await cp(
    path.join(root, "packages/app/src/shell/styles.css"),
    path.join(out, "shell.css"),
  );
  return { version };
}

/**
 * A PDF's page (host-web's `openPdfPage`): Lumière's PDF viewer in pdf/, and
 * in page/pdf-shim.js the stand-in for its extension host.
 */
async function buildPdfViewer(browser, { out, production }) {
  const viewer = path.join(out, "pdf");
  await copyEngine(viewer);
  await esbuild.build(viewerBuild({ out: viewer, production }));
  await esbuild.build({
    ...browser,
    entryPoints: [path.join(root, "packages/host-node/src/page/pdf-shim.ts")],
    outfile: path.join(out, "page", "pdf-shim.js"),
    format: "iife",
  });
}
