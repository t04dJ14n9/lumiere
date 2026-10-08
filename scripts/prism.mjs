import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const prismPlugin = {
  name: "prism-languages",
  setup(build) {
    build.onResolve({ filter: /^prism-all-languages$/ }, () => ({
      path: "all",
      namespace: "prism-languages",
    }));
    build.onLoad({ filter: /.*/, namespace: "prism-languages" }, () => {
      const components = require("prismjs/components.json");
      const ids = Object.keys(components.languages).filter(
        (id) => id !== "meta",
      );
      const ordered = [];
      require("prismjs/dependencies.js")(components, ids).load((id) =>
        ordered.push(id),
      );
      return {
        contents: `import Prism from 'prismjs';\n${ordered.map((id) => `import ${JSON.stringify(`prismjs/components/prism-${id}.js`)};`).join("\n")}\nexport default Prism;`,
        resolveDir: process.cwd(),
        loader: "js",
      };
    });
  },
};
