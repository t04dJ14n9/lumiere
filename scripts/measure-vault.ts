/**
 * Index a generated vault and report what DESIGN §20 budgets: the longest
 * time the extension host is blocked, cold indexing time, and warm-start time
 * from the saved snapshot. Parsing runs in the built worker, as in the
 * extension, so run `pnpm build` first (`pnpm measure:vault` does).
 *
 * Usage: tsx scripts/measure-vault.ts [notes=10000]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setImmediate as yieldToLoop } from "node:timers/promises";
import { createVaultParser } from "../src/host/vault-parser";
import { VaultIndexer } from "../src/plugins/vault/indexer";
import type {
  FileEvent,
  ListedFile,
  VaultFileSystem,
} from "../src/plugins/vault/api";

const WORKER = "dist/workers/vault.cjs";
const ROOT = "memory:///vault";

/** A deterministic generator, so runs are comparable. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function generateVault(count: number): Map<string, string> {
  const next = random(42);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(next() * items.length)]!;
  const folders = ["", "projects/", "areas/", "resources/", "archive/2024/"];
  const words =
    "the vault note link idea draft plan review meeting summary".split(" ");
  const paths = Array.from(
    { length: count },
    (_, n) => `${pick(folders)}Note ${n}.md`,
  );
  const notes = new Map<string, string>();
  for (const path of paths) {
    const lines = [
      "---",
      `tags: [${pick(["work", "home", "idea"])}]`,
      "---",
      "",
    ];
    for (let section = 0; section < 4; section++) {
      lines.push(`## Section ${section}`, "");
      for (let line = 0; line < 6; line++) {
        const linkTarget = pick(paths)
          .replace(/^.*\//, "")
          .replace(/\.md$/, "");
        const text = Array.from({ length: 20 }, () => pick(words)).join(" ");
        lines.push(`${text} [[${linkTarget}]] #topic/${pick(words)}`);
      }
      lines.push("");
    }
    notes.set(path, lines.join("\n"));
  }
  return notes;
}

function memoryFileSystem(notes: Map<string, string>): VaultFileSystem {
  const encoder = new TextEncoder();
  const listed = (path: string): ListedFile => ({
    uri: `${ROOT}/${encodeURI(path)}`,
    path,
    mtime: 1,
    size: notes.get(path)!.length,
  });
  return {
    async list(_root, limit) {
      const paths = [...notes.keys()];
      return {
        files: paths.slice(0, limit).map(listed),
        partial: paths.length > limit,
      };
    },
    async read(uri) {
      // Real reads complete as I/O events, which lets the host run in between.
      await yieldToLoop();
      return encoder.encode(notes.get(decodeURI(uri.slice(ROOT.length + 1)))!);
    },
    watch: (_root: string, _listener: (event: FileEvent) => void) => () => {},
  };
}

/**
 * The longest stretch the event loop was blocked while `run` worked: a
 * 1 ms ticker records the largest gap between its ticks.
 */
async function measure(label: string, run: () => Promise<void>) {
  let longest = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 1);
  const start = performance.now();
  await run();
  const elapsed = performance.now() - start;
  clearInterval(ticker);
  longest = Math.max(longest, performance.now() - last);
  console.log(
    `${label}: ${elapsed.toFixed(0)} ms, longest host block ${longest.toFixed(1)} ms`,
  );
}

async function main() {
  if (!existsSync(WORKER)) {
    throw new Error(`Missing ${WORKER}; run pnpm build first.`);
  }
  const count = Number(process.argv[2] ?? 10_000);
  const notes = generateVault(count);
  const fs = memoryFileSystem(notes);
  const parser = createVaultParser(WORKER);
  const saved = new Map<string, string>();
  const store = {
    read: async (name: string) => saved.get(name),
    write: async (name: string, text: string) => {
      saved.set(name, text);
    },
  };
  const options = {
    root: ROOT,
    fs,
    store,
    parse: parser.parse,
    hash: (text: string) => createHash("sha256").update(text).digest("hex"),
    settings: () => ({
      folderNote: "",
      linkFormat: "shortest" as const,
      excludedFiles: [],
      rootMarkers: [".obsidian"],
    }),
  };
  console.log(
    `Vault: ${count} notes, ${[...notes.values()].reduce((sum, text) => sum + text.length, 0) / 1e6} MB`,
  );

  const cold = new VaultIndexer(options);
  await measure("Cold index (list, read, parse in worker, resolve)", () =>
    cold.settled(),
  );
  const links = cold.index
    .files()
    .reduce((sum, file) => sum + cold.index.resolvedLinks(file.path).size, 0);
  console.log(
    `Resolved link targets: ${links}; tags: ${cold.index.tags().size}`,
  );
  await cold.dispose();
  const bytes = [...saved.values()].reduce((sum, text) => sum + text.length, 0);
  console.log(
    `Snapshot: ${(bytes / 1e6).toFixed(1)} MB in ${saved.size} files`,
  );

  const warm = new VaultIndexer(options);
  await measure("Warm start until links resolve (snapshot)", () => warm.ready);
  await measure("Warm start until reconciled with the file system", () =>
    warm.settled(),
  );
  await warm.dispose();
  parser.dispose();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
