import { readFile, writeFile } from "node:fs/promises";

/**
 * esbuild code-splitting leaves an unused static
 * `import { E as F, F as Q } from "./chunk-YAML.js"` on the module that also
 * `import("yaml")`s dynamically. That unused edge keeps ~104 KB of YAML on the
 * editor cold graph. Strip it (and the entry side-effect import it caused).
 */
export function stripDeadYamlStaticImport() {
  return {
    name: "strip-dead-yaml-static-import",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length || !result.metafile) {
          return;
        }
        const yamlChunks = new Set();
        for (const [outPath, meta] of Object.entries(result.metafile.outputs)) {
          const dyn = (meta.imports ?? []).some(
            (i) =>
              i.kind === "dynamic-import" &&
              /browser-[A-Z0-9]+\.js$/.test(i.path ?? ""),
          );
          if (!dyn) {
            continue;
          }
          let source;
          try {
            source = await readFile(outPath, "utf8");
          } catch {
            continue;
          }
          if (!/import\(["']\.\/browser-[A-Z0-9]+\.js["']\)/.test(source)) {
            continue;
          }
          const next = source.replace(
            /^import\{[^}]+\}from"(\.\/chunk-[A-Z0-9]+\.js)";\n?/m,
            (stmt, chunk) => {
              const names = [...stmt.matchAll(/\bas ([A-Za-z_$][\w$]*)/g)].map(
                (m) => m[1],
              );
              const body = source.slice(stmt.length);
              if (names.some((n) => new RegExp(`\\b${n}\\b`).test(body))) {
                return stmt;
              }
              yamlChunks.add(chunk.replace(/^\.\//, ""));
              return "";
            },
          );
          if (next !== source) {
            await writeFile(outPath, next);
          }
        }
        if (yamlChunks.size === 0) {
          return;
        }
        for (const outPath of Object.keys(result.metafile.outputs)) {
          if (!/\/(editor|diff)\.js$/.test(outPath)) {
            continue;
          }
          let source;
          try {
            source = await readFile(outPath, "utf8");
          } catch {
            continue;
          }
          let next = source;
          for (const chunk of yamlChunks) {
            next = next.replace(new RegExp(`import"\\./${chunk}";`, "g"), "");
          }
          if (next !== source) {
            await writeFile(outPath, next);
          }
        }
      });
    },
  };
}
