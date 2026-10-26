// Unit tests of every package, each run from its own directory: the core,
// the agent formats, then Lumière, Lumière PDF, the Node host, the web host,
// DSH, the app, ink, the iPad app and the web app.
// Root scripts are tested too.
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
  run("packages/agents", "pnpm", [
    "exec",
    "tsx",
    "--test",
    ...options,
    // From the package's directory, where its fixtures are.
    ...testFiles("packages/agents/test").map((file) =>
      file.replace("packages/agents/", ""),
    ),
  ]),
  run("packages/markdown", "node", ["scripts/test.mjs"]),
  run("packages/pdf", "pnpm", ["test"]),
  run("packages/host-node", "pnpm", ["test"]),
  run("packages/host-web", "pnpm", ["test"]),
  run("packages/dsh", "pnpm", ["test"]),
  run("packages/app", "pnpm", ["test"]),
  run("packages/ink", "pnpm", ["test"]),
  run("apps/ipad", "pnpm", ["test"]),
  run("apps/web", "pnpm", ["test"]),
].filter((status) => status !== 0);
process.exit(failures.length ? 1 : 0);
