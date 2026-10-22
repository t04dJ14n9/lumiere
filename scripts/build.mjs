// Builds the extension into dist/:
//   dist/extension.js   the extension host (src/extension.ts, both products)
//   dist/markdown/      Lumière's webviews, workers and API types
//   dist/pdf/           Lumière PDF's viewer, PDF engine and agent bridge
// Each product builds its own assets (its scripts/build.mjs); this script
// bundles the host and copies those assets into place.
//
// Usage: node scripts/build.mjs [--production]
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { lazyBridgeServer } from "../packages/pdf/scripts/lazy-bridge-server.mjs";
import { lazyYaml } from "../packages/markdown/scripts/lazy-yaml.mjs";

const production = process.argv.includes("--production");
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const dist = path.join(root, "dist");
const products = ["markdown", "pdf"];

function buildProduct(name) {
  execFileSync(
    process.execPath,
    ["scripts/build.mjs", ...(production ? ["--production"] : [])],
    { cwd: path.join(root, "packages", name), stdio: "inherit" },
  );
}

await rm(dist, { recursive: true, force: true });
for (const name of products) {
  buildProduct(name);
}
const host = await esbuild.build({
  entryPoints: [path.join(root, "src/extension.ts")],
  outfile: path.join(dist, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  metafile: true,
  logLevel: "info",
  plugins: [
    lazyBridgeServer("./pdf/agent-bridge-server.js"),
    lazyYaml("./markdown/yaml-runtime.cjs"),
  ],
});
for (const name of products) {
  await cp(path.join(root, "packages", name, "dist"), path.join(dist, name), {
    recursive: true,
  });
}

// Every bundled source file, for scripts/third-party-notices.mjs.
const productInputs = [];
for (const name of products) {
  const file = path.join(
    root,
    "packages",
    name,
    "artifacts/bundle-inputs.json",
  );
  const inputs = JSON.parse(await readFile(file, "utf8"));
  productInputs.push(
    ...inputs.map((input) => path.join("packages", name, input)),
  );
}
// Fail loudly if Follow Link create-on-click for basename Markdown links
// was dropped (wrong @workshop/markdown resolution / stale foreign worktree).
const extensionJs = await readFile(path.join(dist, "extension.js"), "utf8");
if (!/create:\w+\.wiki\s*\|\|/.test(extensionJs)) {
  throw new Error(
    "dist/extension.js missing Markdown basename create path (expected create:<wiki>||...)",
  );
}
if (production && !/yaml-runtime\.cjs/.test(extensionJs)) {
  throw new Error(
    "dist/extension.js must lazy-require markdown/yaml-runtime.cjs",
  );
}
const hostInputs = Object.keys(host.metafile.inputs);
const linksHost = hostInputs.find((input) =>
  input.replaceAll("\\", "/").endsWith("plugins/links/host.ts"),
);
const expectedLinksHost = path
  .join("packages", "markdown", "src", "plugins", "links", "host.ts")
  .replaceAll("\\", "/");
if (!linksHost || linksHost.replaceAll("\\", "/") !== expectedLinksHost) {
  throw new Error(
    `extension bundle must include ${expectedLinksHost}, got ${linksHost ?? "(missing)"}`,
  );
}

await mkdir(path.join(root, "artifacts"), { recursive: true });
await writeFile(
  path.join(root, "artifacts/bundle-inputs.json"),
  JSON.stringify(
    [
      ...new Set([...Object.keys(host.metafile.inputs), ...productInputs]),
    ].sort(),
    null,
    1,
  ),
);
