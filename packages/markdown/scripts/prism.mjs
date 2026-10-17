import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const components = require("prismjs/components.json");
const languages = components.languages;
const ids = Object.keys(languages).filter((id) => id !== "meta");
const ordered = [];
require("prismjs/dependencies.js")(components, ids).load((id) =>
  ordered.push(id),
);
const values = (value) =>
  (Array.isArray(value) ? value : [value]).filter(Boolean);

/** Retain embedded syntax and grammar extensions from the former all-language bundle. */
export function languagePlan(id) {
  const needed = new Set([id]);
  let previousSize = 0;
  while (needed.size !== previousSize) {
    previousSize = needed.size;
    for (const name of needed) {
      const entry = languages[name];
      for (const dependency of [
        ...values(entry.require),
        ...values(entry.optional),
        // A shared modifier runs once. Its targets must exist before it runs,
        // or a target requested later would permanently miss the extension.
        ...values(entry.modify),
      ]) {
        needed.add(dependency);
      }
    }
    for (const name of ids) {
      if (values(languages[name].modify).some((target) => needed.has(target))) {
        needed.add(name);
      }
    }
  }
  return ordered.filter((name) => needed.has(name));
}

function registrySource() {
  const loaders = ids.map(
    (id) =>
      `[${JSON.stringify(id)}, () => import(${JSON.stringify(`prism-language:${id}`)}).then(module => module.load())]`,
  );
  const aliases = ids.flatMap((id) =>
    values(languages[id].alias).map((alias) => [alias, id]),
  );
  return `import Prism from 'prismjs/components/prism-core';
export default Prism;
export const languageLoaders = new Map([${loaders.join(",\n")}]);
export const languageAliases = new Map(${JSON.stringify(aliases)});`;
}

export const prismPlugin = {
  name: "prism-languages",
  setup(build) {
    build.onResolve(
      { filter: /^prism-(?:all-languages|languages|language:.+)$/ },
      ({ path }) => ({
        path:
          path === "prism-languages"
            ? "registry"
            : path.replace(/^prism-language:/, ""),
        namespace: "prism-languages",
      }),
    );
    build.onLoad({ filter: /.*/, namespace: "prism-languages" }, ({ path }) => {
      return {
        contents: moduleSource(path),
        resolveDir: process.cwd(),
        loader: "js",
      };
    });
  },
};

function moduleSource(path) {
  if (path === "registry") {
    return registrySource();
  }
  if (path === "prism-all-languages") {
    // Retained only as the unit-test reference for the former bundle.
    return `import Prism from 'prismjs';\n${ordered.map((id) => `import ${JSON.stringify(`prismjs/components/prism-${id}.js`)};`).join("\n")}\nexport default Prism;`;
  }
  // Prism components mutate a global grammar and do not declare their own
  // imports. Await each component so ESM chunk hoisting cannot reorder them.
  return `export async function load() {\n${languagePlan(path)
    .map(
      (id) =>
        `await import(${JSON.stringify(`prismjs/components/prism-${id}.js`)});`,
    )
    .join("\n")}\n}`;
}
