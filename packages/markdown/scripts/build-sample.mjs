// Builds the sample external plugin (test/fixtures/sample-plugin) into its
// own dist/, so it can be packaged or run with --extensionDevelopmentPath.
import * as esbuild from "esbuild";
await esbuild.build({
  entryPoints: ["test/fixtures/sample-plugin/src/extension.ts"],
  outfile: "test/fixtures/sample-plugin/dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  logLevel: "info",
});
