/**
 * Keeps the `yaml` package out of the extension-host bundle. `loadYaml()`'s
 * `require("yaml")` becomes a require of the separately built runtime
 * (`output`, relative to dist/extension.js). Notes without a `---` fence
 * never load it.
 */
export function lazyYaml(output) {
  return {
    name: "lazy-yaml",
    setup(build) {
      build.onResolve({ filter: /^yaml$/ }, (args) =>
        /[/\\]load-yaml\.[cm]?[jt]s$/.test(args.importer)
          ? { path: output, external: true }
          : undefined,
      );
    },
  };
}
