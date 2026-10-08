import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const tests = ["src", "test/unit"].flatMap((root) =>
  readdirSync(root, { recursive: true })
    .filter((p) => p.endsWith(".test.ts"))
    .map((p) => `${root}/${p}`),
);
const result = spawnSync("pnpm", ["exec", "tsx", "--test", ...tests], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
