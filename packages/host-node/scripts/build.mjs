// Builds host-node's editor and page assets into dist/assets/.
// Usage: node scripts/build.mjs [--production]
import { rm } from "node:fs/promises";
import path from "node:path";
import { buildHostAssets } from "./assets.mjs";

const production = process.argv.includes("--production");
const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(here, "dist", "assets");

await rm(out, { recursive: true, force: true });
await buildHostAssets({ out, production });
console.log(`Built ${path.relative(path.resolve(here, "../.."), out)}`);
