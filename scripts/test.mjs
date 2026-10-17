import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const tests = ["src", "test/unit", "packages/core/test"].flatMap((root) =>
  readdirSync(root, { recursive: true })
    .filter((p) => p.endsWith(".test.ts"))
    .map((p) => `${root}/${p}`),
);
// Shared development hosts may need fewer workers to keep performance probes
// within their deadlines. The default remains Node's available-CPU policy.
const concurrency = process.env.MARKDOWN_WORKBENCH_TEST_CONCURRENCY;
const workerOptions = concurrency ? [`--test-concurrency=${concurrency}`] : [];
const result = spawnSync(
  "pnpm",
  ["exec", "tsx", "--test", ...workerOptions, ...tests],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
