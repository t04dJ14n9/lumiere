// Builds the bundle DeepSeek Harness installs, into dist/bundle/:
//   index.js           the host half (src/host), loaded by DSH as a plugin
//   client.js          the browser half (src/client), in DSH's module format
//   dsh/shim.js        the editor page's stand-in for VS Code's webview API
//   markdown/          the built editor and its workers (packages/markdown/dist)
//   contributed.json   Lumière's settings and their defaults, from package.json
//   package.json, cordis.patch.yml, locale/, icon.png, LICENSE, notices
//
// Usage: node scripts/build.mjs [--production]
// Install into a DSH profile: dsh plugin --profile web add link:<dist/bundle>
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const root = path.resolve(here, "../..");
const out = path.join(here, "dist", "bundle");
const markdownDist = path.join(root, "packages", "markdown", "dist");

// Always rebuilt: the host half is built from source just below, and a page
// from an older build rejects settings the host now sends.
execFileSync(
  process.execPath,
  ["scripts/build.mjs", ...(production ? ["--production"] : [])],
  { cwd: path.join(root, "packages", "markdown"), stdio: "inherit" },
);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  legalComments: "none",
};

// ESM, because DSH imports plugins; Lumière's and ws's CommonJS still need require().
await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/host/index.ts")],
  outfile: path.join(out, "index.js"),
  platform: "node",
  format: "esm",
  target: "node22",
  // ws's optional native speed-ups; ws works without them.
  external: ["bufferutil", "utf-8-validate"],
  banner: {
    js: 'import { createRequire as __lumiereRequire } from "node:module"; const require = __lumiereRequire(import.meta.url);',
  },
});
for (const [entry, file] of [
  ["src/client/index.ts", "client.js"],
  ["src/webview/shim.ts", "dsh/shim.js"],
]) {
  await esbuild.build({
    ...common,
    entryPoints: [path.join(here, entry)],
    outfile: path.join(out, file),
    platform: "browser",
    format: "iife",
    target: "es2022",
  });
}

await cp(markdownDist, path.join(out, "markdown"), {
  recursive: true,
  filter: (source) => (production ? !source.endsWith(".map") : true),
});

const manifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const contributed = manifest.contributes.configuration
  .flatMap((section) => Object.entries(section.properties ?? {}))
  .filter(([key]) => key.startsWith("lumiere.markdown."))
  .map(([key, schema]) => ({ key, schema }));
await writeFile(
  path.join(out, "contributed.json"),
  JSON.stringify(contributed),
);

await writeFile(
  path.join(out, "package.json"),
  JSON.stringify(
    {
      name: "@lumiere/dsh",
      version: manifest.version,
      description:
        "Lumière in DeepSeek Harness: Obsidian-style Live Preview for the Markdown notes in your workspace.",
      license: "MIT",
      repository: manifest.repository,
      type: "module",
      main: "index.js",
      icon: "./icon.png",
      exports: {
        ".": "./index.js",
        "./client": "./client.js",
        "./package.json": "./package.json",
        "./locale/*.json": "./locale/*.json",
      },
      dsh: {
        bundle: { patch: "./cordis.patch.yml" },
        client: { platform: "web" },
      },
    },
    null,
    2,
  ) + "\n",
);
await cp(path.join(here, "bundle"), out, { recursive: true });
await cp(path.join(root, "media", "icon.png"), path.join(out, "icon.png"));
await cp(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
const notices = await readFile(
  path.join(root, "THIRD_PARTY_NOTICES.md"),
  "utf8",
);
const ws = await readFile(
  path.join(here, "node_modules", "ws", "LICENSE"),
  "utf8",
);
await writeFile(
  path.join(out, "THIRD_PARTY_NOTICES.md"),
  `${notices}\n## ws (bundled in index.js)\n\n\`\`\`\n${ws.trim()}\n\`\`\`\n`,
);
console.log(`Built ${path.relative(root, out)}`);
