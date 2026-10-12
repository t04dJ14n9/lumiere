/**
 * Generic ReDoS / superlinear-work harness: each registered text function
 * runs on adversarial 80k-110k character inputs (./inputs.ts) in a child
 * process with a hard deadline. A stalled case is named.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Target } from "./target";

const probe = fileURLToPath(new URL("./probe.ts", import.meta.url));
/** Per case; generous for slow boxes, far below a quadratic stall. */
const CASE_MS = 1500;
const DEADLINE_MS = 20_000;

interface Line {
  start?: string;
  done?: string;
  ms?: number;
}

/** One test per target in the module at `path` (which exports `targets`). */
export function fuzzSuite(
  path: string,
  label: string,
  targets: Record<string, Target>,
): void {
  for (const name of Object.keys(targets)) {
    test(`fuzz: ${label}.${name} is linear on adversarial input`, () => {
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", probe, path, name],
        { timeout: DEADLINE_MS, encoding: "utf8", maxBuffer: 64 << 20 },
      );
      const lines = child.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Line);
      const last = lines.filter((line) => line.start).at(-1)?.start;
      assert.equal(child.signal, null, `stalled (killed) on case ${last}`);
      assert.equal(child.status, 0, `${last}: ${child.stderr}`);
      const slow = lines.filter((line) => line.done && line.ms! > CASE_MS);
      assert.deepEqual(
        slow.map((line) => `${line.done}: ${Math.round(line.ms!)} ms`),
        [],
      );
    });
  }
}
