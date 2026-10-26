// The PDF viewer page's files, built into `out`: viewer.js and viewer.css
// (with the codicon font beside it) and pdfium.wasm, the engine the viewer
// loads at runtime. Built into dist/webview for the extension
// (scripts/build.mjs), and into pdf/ for the web and iPad apps
// (packages/host-web/scripts/bundle.mjs).
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));

/**
 * esbuild options for viewer.js.
 * @param {{ out: string, production: boolean }} options
 * @returns {import('esbuild').BuildOptions}
 */
export function viewerBuild({ out, production }) {
  return {
    bundle: true,
    metafile: true,
    sourcemap: !production,
    minify: production,
    logLevel: "info",
    entryPoints: [path.join(root, "src/webview/main.tsx")],
    outfile: path.join(out, "viewer.js"),
    platform: "browser",
    format: "iife",
    target: "chrome120",
    jsx: "automatic",
    // The codicon font, next to viewer.css, which refers to it relatively.
    loader: { ".ttf": "file" },
    assetNames: "[name]",
    // EmbedPDF's engine loads its worker from an inline blob and its WASM from
    // the URL the host provides, so neither needs special handling here.
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        production ? "production" : "development",
      ),
    },
  };
}

/** Copy the PDF engine (pdfium.wasm) into `out`. */
export async function copyEngine(out) {
  const pdfiumEntry = require.resolve("@embedpdf/pdfium");
  const wasm = path.join(path.dirname(pdfiumEntry), "pdfium.wasm");
  await mkdir(out, { recursive: true });
  await copyFile(wasm, path.join(out, "pdfium.wasm"));
}
