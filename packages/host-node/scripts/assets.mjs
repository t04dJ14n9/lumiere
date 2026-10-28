// What every embedder of host-node ships beside its own code, built into `out`:
//   markdown/          the built editor and its workers (packages/markdown/dist)
//   page/shim.js       the page's stand-in for VS Code's webview API (src/page)
//   contributed.json   Lumière's settings and defaults, from package.json
//   menus.json         Lumière's right-click menu items, with their titles
// Used by packages/dsh/scripts/build.mjs and packages/app/scripts/build.mjs.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const root = path.resolve(here, "../..");

/**
 * @param {{ out: string, production: boolean }} options
 */
export async function buildHostAssets({ out, production }) {
  // Always rebuilt: an embedder's host code is built from source too, and a
  // page from an older build rejects settings the host now sends.
  execFileSync(
    process.execPath,
    ["scripts/build.mjs", ...(production ? ["--production"] : [])],
    { cwd: path.join(root, "packages", "markdown"), stdio: "inherit" },
  );
  await mkdir(out, { recursive: true });
  await cp(
    path.join(root, "packages", "markdown", "dist"),
    path.join(out, "markdown"),
    {
      recursive: true,
      filter: (source) => (production ? !source.endsWith(".map") : true),
    },
  );
  await esbuild.build({
    entryPoints: [path.join(here, "src/page/shim.ts")],
    outfile: path.join(out, "page", "shim.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    sourcemap: !production,
    minify: production,
    legalComments: "none",
    logLevel: "info",
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
  const titles = new Map(
    manifest.contributes.commands.map((command) => [
      command.command,
      command.title,
    ]),
  );
  const menus = (manifest.contributes.menus?.["webview/context"] ?? [])
    .filter((item) => item.command.startsWith("lumiere.markdown."))
    .map((item) => ({
      ...item,
      title: titles.get(item.command) ?? item.command,
    }));
  await writeFile(path.join(out, "menus.json"), JSON.stringify(menus));
  const paletteWhen = new Map(
    (manifest.contributes.menus?.commandPalette ?? [])
      .filter((item) => typeof item.command === "string")
      .map((item) => [item.command, item.when]),
  );
  const commands = (manifest.contributes.commands ?? [])
    .filter((item) => item.command.startsWith("lumiere.markdown."))
    .map((item) => ({
      command: item.command,
      title: item.title,
      ...(item.category ? { category: item.category } : {}),
      ...(paletteWhen.has(item.command)
        ? { when: paletteWhen.get(item.command) }
        : {}),
    }));
  await writeFile(path.join(out, "commands.json"), JSON.stringify(commands));
  return { version: manifest.version, repository: manifest.repository };
}

/** esbuild options for a host half: ESM for Node, with require() for CommonJS dependencies. */
export const nodeHostBuild = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  logLevel: "info",
  // ws's optional native speed-ups; ws works without them.
  external: ["bufferutil", "utf-8-validate"],
  banner: {
    js: 'import { createRequire as __lumiereRequire } from "node:module"; const require = __lumiereRequire(import.meta.url);',
  },
};
