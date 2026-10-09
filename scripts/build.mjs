// Builds the two halves of the extension:
//   dist/extension.js         the VS Code host (Node, CommonJS)
//   dist/webview/viewer.js    the PDF viewer page (browser), plus viewer.css
//   dist/webview/pdfium.wasm  the PDF engine, loaded by the viewer at runtime
//
// Usage: node scripts/build.mjs [--watch] [--production]
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const dist = path.join(root, 'dist');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const extension = {
  ...shared,
  entryPoints: [path.join(root, 'src/extension/extension.ts')],
  outfile: path.join(dist, 'extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

const webview = {
  ...shared,
  entryPoints: [path.join(root, 'src/webview/main.tsx')],
  outfile: path.join(dist, 'webview/viewer.js'),
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  jsx: 'automatic',
  // The codicon font, next to viewer.css, which refers to it relatively.
  loader: { '.ttf': 'file' },
  assetNames: '[name]',
  // EmbedPDF's engine loads its worker from an inline blob and its WASM from
  // the URL the host provides, so neither needs special handling here.
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
};

async function copyEngine() {
  const pdfiumEntry = require.resolve('@embedpdf/pdfium');
  const wasm = path.join(path.dirname(pdfiumEntry), 'pdfium.wasm');
  await mkdir(path.join(dist, 'webview'), { recursive: true });
  await copyFile(wasm, path.join(dist, 'webview/pdfium.wasm'));
}

await rm(dist, { recursive: true, force: true });
await copyEngine();
if (watch) {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(webview)]);
  await Promise.all(contexts.map(context => context.watch()));
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
