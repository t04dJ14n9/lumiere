// What `tauri build` bundles beside the app (src-tauri/tauri.bundle.json):
//   src-tauri/binaries/lumiere-node-<target>   an official Node.js runtime
//   src-tauri/resources/app/                   the server and its pages (packages/app)
// The app runs `lumiere-node <resources>/app/server.js` (src-tauri/src/server.rs).
//
// Node comes from nodejs.org, checked against its published SHA-256 sums,
// and is cached in .cache/. A system Node (Homebrew's, say) links libraries
// that are not in the bundle, so it is never used.
//
// Usage: node scripts/build-sidecar.mjs [--target <rust target triple>]
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

/** The Node.js the app ships; keep it on a release line that is supported. */
const NODE_VERSION = "26.5.0";

const desktop = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const root = path.resolve(desktop, "../..");
const tauri = path.join(desktop, "src-tauri");
const cache = path.join(desktop, ".cache");

const target = argument("--target") ?? hostTarget();
const node = nodeDownload(target);

const built = spawnSync(
  process.execPath,
  ["scripts/build.mjs", "--production"],
  {
    cwd: path.join(root, "packages/app"),
    stdio: "inherit",
  },
);
if (built.status !== 0) {
  process.exit(built.status ?? 1);
}
const resources = path.join(tauri, "resources", "app");
await rm(resources, { recursive: true, force: true });
await cp(path.join(root, "packages/app/dist/app"), resources, {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});

const runtime = await fetchNode(node);
const sidecar = path.join(
  tauri,
  "binaries",
  `lumiere-node-${target}${node.exe}`,
);
await mkdir(path.dirname(sidecar), { recursive: true });
await cp(runtime, sidecar);
await chmod(sidecar, 0o755);
console.log(`Sidecar: ${path.relative(root, sidecar)} (Node ${NODE_VERSION})`);
console.log(`Resources: ${path.relative(root, resources)}`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hostTarget() {
  const info = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = /^host: (.+)$/m.exec(info)?.[1];
  if (!host) {
    throw new Error("rustc -vV did not name the host target");
  }
  return host;
}

/** The nodejs.org archive for a Rust target triple, and where Node is inside it. */
function nodeDownload(triple) {
  const arch = triple.startsWith("aarch64")
    ? "arm64"
    : triple.startsWith("x86_64")
      ? "x64"
      : undefined;
  if (!arch) {
    throw new Error(`No Node.js build for ${triple}`);
  }
  const base = `node-v${NODE_VERSION}`;
  if (triple.includes("apple-darwin")) {
    return {
      archive: `${base}-darwin-${arch}.tar.gz`,
      inside: `${base}-darwin-${arch}/bin/node`,
      exe: "",
    };
  }
  if (triple.includes("windows")) {
    return {
      archive: `${base}-win-${arch}.zip`,
      inside: `${base}-win-${arch}/node.exe`,
      exe: ".exe",
    };
  }
  if (triple.includes("linux")) {
    return {
      archive: `${base}-linux-${arch}.tar.xz`,
      inside: `${base}-linux-${arch}/bin/node`,
      exe: "",
    };
  }
  throw new Error(`No Node.js build for ${triple}`);
}

/** The Node binary from the archive, downloaded once and checked. */
async function fetchNode({ archive, inside }) {
  const folder = path.join(cache, `node-${NODE_VERSION}`);
  const binary = path.join(folder, inside);
  if (await stat(binary).catch(() => undefined)) {
    return binary;
  }
  const release = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const sums = await (
    await download(`${release}/SHASUMS256.txt`)
  ).toString("utf8");
  const expected = sums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === archive)?.[0];
  if (!expected) {
    throw new Error(
      `${archive} is not in Node ${NODE_VERSION}'s SHASUMS256.txt`,
    );
  }
  const bytes = await download(`${release}/${archive}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(`${archive}: SHA-256 ${actual}, expected ${expected}`);
  }
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, archive);
  await writeFile(file, bytes);
  // bsdtar (macOS, Windows 10+) and GNU tar both read these archives.
  execFileSync("tar", ["-xf", file, "-C", folder, inside], {
    stdio: "inherit",
  });
  await readFile(binary);
  return binary;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
