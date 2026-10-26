import test from "node:test";
import assert from "node:assert/strict";
import { builtinModules } from "node:module";
import * as path from "node:path";

test("the shared host entry imports no Node built-in, so a browser can run it", async () => {
  const esbuild = await import("esbuild");
  const builtins = new Set(builtinModules);
  const isBuiltin = (name: string) =>
    name.startsWith("node:") || builtins.has(name);
  const result = await esbuild.build({
    entryPoints: [path.resolve("src/core.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [
      {
        name: "node-builtins",
        setup(build) {
          // Kept external, so the metafile names who imports them.
          build.onResolve({ filter: /^[a-z_:/]+$/ }, (args) =>
            isBuiltin(args.path)
              ? { path: args.path, external: true }
              : undefined,
          );
        },
      },
    ],
  });
  const importers = Object.entries(result.metafile.inputs).flatMap(
    ([file, input]) =>
      input.imports
        .filter((item) => isBuiltin(item.path))
        .map((item) => `${file} imports ${item.path}`),
  );
  assert.deepEqual(importers, []);
});
