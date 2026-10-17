// Unit tests of every package, each run from its own directory: the core,
// then Markdown Workshop, then PDF Workshop. Root scripts are tested too.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const concurrency = process.env.WORKSHOP_TEST_CONCURRENCY;
const options = concurrency ? [`--test-concurrency=${concurrency}`] : [];

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

function testFiles(...roots) {
  return roots.flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".test.ts"))
      .map((file) => `${root}/${file}`),
  );
}

const failures = [
  run(".", "pnpm", [
    "exec",
    "tsx",
    "--test",
    ...options,
    ...testFiles("packages/core/test", "test/unit"),
  ]),
  run("packages/markdown", "node", ["scripts/test.mjs"]),
  run("packages/pdf", "pnpm", ["test"]),
].filter((status) => status !== 0);
process.exit(failures.length ? 1 : 0);
