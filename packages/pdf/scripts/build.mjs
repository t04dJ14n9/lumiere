// Builds PDF Workshop's assets into this package's dist/ (the repository root
// bundles the extension host and copies this dist/ into dist/pdf/):
//   dist/agent-bridge-server.js  the agent bridge's MCP server, loaded by the
//                             host only when the bridge starts (it carries the
//                             MCP SDK and zod, which the host never loads otherwise)
//   dist/bridge-stdio.js      the stdio shim MCP clients run (see Copy MCP Setup)
//   dist/webview/viewer.js    the PDF viewer page (browser), plus viewer.css
//   dist/webview/pdfium.wasm  the PDF engine, loaded by the viewer at runtime
//
// Usage: node scripts/build.mjs [--watch] [--production]
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
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
  metafile: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const bridgeServerEntry = path.join(root, 'src/extension/plugins/agentBridge/mcp/server.ts');

const bridgeServer = {
  ...shared,
  entryPoints: [bridgeServerEntry],
  outfile: path.join(dist, 'agent-bridge-server.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

const bridgeStdio = {
  ...shared,
  entryPoints: [path.join(root, 'src/bridge-stdio/main.ts')],
  outfile: path.join(dist, 'bridge-stdio.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
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
  const contexts = await Promise.all([bridgeServer, bridgeStdio, webview].map(options => esbuild.context(options)));
  await Promise.all(contexts.map(context => context.watch()));
} else {
  const results = await Promise.all([bridgeServer, bridgeStdio, webview].map(options => esbuild.build(options)));
  // Every bundled source file; the repository's third-party notices read it.
  const inputs = new Set(results.flatMap(result => Object.keys(result.metafile.inputs)));
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/bundle-inputs.json'), JSON.stringify([...inputs].sort(), null, 1));
}
