// Lumière's desktop app in development: build the server and its pages
// (packages/app), then `tauri dev`, with the app running that server under
// this Node (src-tauri/src/server.rs reads LUMIERE_SERVER in debug builds).
//
//   pnpm --filter @workshop/desktop dev
//   LUMIERE_DATA=/tmp/lumiere-dev pnpm --filter @workshop/desktop dev   (a throwaway data folder)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const desktop = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const root = path.resolve(desktop, "../..");

const built = spawnSync(process.execPath, ["scripts/build.mjs"], {
  cwd: path.join(root, "packages/app"),
  stdio: "inherit",
});
if (built.status !== 0) {
  process.exit(built.status ?? 1);
}
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tauri = spawn(pnpm, ["exec", "tauri", "dev", ...process.argv.slice(2)], {
  cwd: desktop,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    LUMIERE_SERVER: path.join(root, "packages/app/dist/app/server.js"),
    LUMIERE_NODE: process.execPath,
  },
});
tauri.on("exit", (code) => process.exit(code ?? 1));
