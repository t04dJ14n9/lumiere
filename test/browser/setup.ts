import { build } from "esbuild";
export default async function setup() {
  await build({
    entryPoints: ["test/browser/fake-host.ts"],
    bundle: true,
    outfile: "artifacts/fake-host.js",
    platform: "browser",
    format: "iife",
    target: "chrome120",
  });
}
