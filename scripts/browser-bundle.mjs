// The browser's extension host bundle (src/extension.web.ts), for
// scripts/build.mjs and the test that keeps it free of Node.
import path from "node:path";

// A Node built-in reached from the browser entry fails the build, naming the
// module that imported it, instead of a vague "could not resolve" or a stub
// that fails at run time.
const NODE_BUILT_IN =
  /^(node:|(assert|buffer|child_process|crypto|events|fs|http|https|module|net|os|path|process|readline|stream|timers|tty|url|util|worker_threads|zlib)(\/|$))/;

export const browserGuard = {
  name: "browser-guard",
  setup(build) {
    build.onResolve({ filter: NODE_BUILT_IN }, (args) => ({
      errors: [
        {
          text: `${args.path} is a Node built-in: the browser build cannot import it (from ${args.importer})`,
        },
      ],
    }));
  },
};

/**
 * esbuild options for the browser's extension host bundle: one CommonJS
 * file, as VS Code's web extension host loads it, with no Node built-in.
 */
export function browserHost(root) {
  return {
    entryPoints: [path.join(root, "src/extension.web.ts")],
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2022",
    external: ["vscode"],
    metafile: true,
    plugins: [browserGuard],
  };
}
