// Builds Lumière's own server and app shell into dist/app/:
//   server.js          the server (src/server/cli.ts): node dist/app/server.js --vault <dir>
//   shell/             the window's UI (src/shell): index.html, shell.js, shell.css
//   markdown/, page/shim.js, contributed.json   host-node's assets
//
// Usage: node scripts/build.mjs [--production]
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import {
  buildHostAssets,
  nodeHostBuild,
} from "../../host-node/scripts/assets.mjs";

const production = process.argv.includes("--production");
const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(here, "dist", "app");

await rm(out, { recursive: true, force: true });
const { version } = await buildHostAssets({ out, production });
const define = { LUMIERE_VERSION: JSON.stringify(version) };
const common = { sourcemap: !production, minify: production, define };

await esbuild.build({
  ...nodeHostBuild,
  ...common,
  entryPoints: [path.join(here, "src/server/cli.ts")],
  outfile: path.join(out, "server.js"),
  banner: { js: `#!/usr/bin/env node\n${nodeHostBuild.banner.js}` },
});
await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/shell/main.tsx")],
  outfile: path.join(out, "shell", "shell.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  legalComments: "none",
  logLevel: "info",
});
await cp(
  path.join(here, "src/shell/index.html"),
  path.join(out, "shell", "index.html"),
);
await cp(
  path.join(here, "src/shell/styles.css"),
  path.join(out, "shell", "shell.css"),
);
console.log(`Built ${path.relative(path.resolve(here, "../.."), out)}`);
