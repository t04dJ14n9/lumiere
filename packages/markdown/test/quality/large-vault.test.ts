/**
 * Opening speed in a large vault, on the real Markdown host: a code
 * repository with notes in it, as the owner's is (about 126,000 files).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { budgets, record } from "./budgets";
import { speedFactor } from "./calibration";
import { openVault, vaultFiles } from "./large-vault";

const NOTES = 1000;
const BURST = 200;

/** Host CPU and bytes to the open note per change, over a burst. */
async function burst(files: number) {
  const vault = await openVault(vaultFiles(files, NOTES));
  try {
    const readyMs = await vault.ready();
    await vault.settle();
    // A first burst warms the JIT, so the measured one compares like with like.
    vault.changeNotes(20);
    await vault.settle();
    const sentBefore = vault.sent();
    const cpu = process.cpuUsage();
    vault.changeNotes(BURST);
    await vault.settle();
    const used = process.cpuUsage(cpu);
    return {
      readyMs,
      cpuPerChangeMs: (used.user + used.system) / 1000 / BURST,
      bytesPerChange: (vault.sent() - sentBefore) / BURST,
    };
  } finally {
    await vault.dispose();
  }
}

test("a large vault: notes open quickly, and vault changes stay cheap", async () => {
  const factor = speedFactor();
  const small = await burst(3_000);
  const large = await burst(30_000);
  record("large-vault", { factor, small, large });

  assert.ok(
    large.readyMs <= budgets.readyInLargeVaultMs * factor,
    `ready took ${Math.round(large.readyMs)} ms in a 30,000-file vault`,
  );
  for (const [size, run] of [
    ["3,000", small],
    ["30,000", large],
  ] as const) {
    assert.ok(
      run.bytesPerChange <= budgets.bytesPerVaultChange,
      `${size} files: ${Math.round(run.bytesPerChange)} bytes per vault change reached the open note`,
    );
  }
  const floor = budgets.vaultChangeFloorMs * factor;
  assert.ok(
    large.cpuPerChangeMs <= floor ||
      large.cpuPerChangeMs <=
        budgets.vaultChangeCostRatio * small.cpuPerChangeMs,
    `a vault change cost ${large.cpuPerChangeMs.toFixed(2)} ms with 30,000 files and ${small.cpuPerChangeMs.toFixed(2)} ms with 3,000: work grows with the vault`,
  );
});
