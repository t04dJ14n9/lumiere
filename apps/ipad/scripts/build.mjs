// Builds the iPad app's web content into dist/web, which `cap sync ios`
// copies into the app: the window and host-web (src/main.ts), the editor
// and its page shim, the browser workers, and Lumière's settings and menus.
// No service worker: the app ships its files, and WKWebView has none.
//
// Usage: node scripts/build.mjs [--production]
import path from "node:path";
import { buildBrowserApp } from "../../../packages/host-web/scripts/bundle.mjs";

const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
await buildBrowserApp({
  entry: path.join(here, "src/main.ts"),
  html: path.join(here, "index.html"),
  out: path.join(here, "dist", "web"),
  production: process.argv.includes("--production"),
});
