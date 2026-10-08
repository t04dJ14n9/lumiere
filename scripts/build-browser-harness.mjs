import { build } from "esbuild";
import { prismPlugin } from "./prism.mjs";
await build({
  entryPoints: ["test/browser/fake-host.ts"],
  bundle: true,
  plugins: [prismPlugin],
  outfile: "artifacts/fake-host.js",
  platform: "browser",
  format: "iife",
  target: "chrome120",
});
