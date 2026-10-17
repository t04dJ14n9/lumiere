import test from "node:test";
import assert from "node:assert/strict";
import { MemoryTempFs } from "./memory-temp-fs";
import { publishIdeContextTemp } from "../../../src/shared/ide-context/temp-publish";
import { reclaimEligible } from "../../../src/shared/ide-context/temp-reclaim";

test("Phase3 stall: pause AFTER successful final revalidation past leaseUntil; sibling reclaims; resume must NOT publish unleased final", async () => {
  const fs = new MemoryTempFs();
  let now = Date.parse("2026-10-16T00:00:00.000Z");
  fs.nowMs = now; // keep mtimes aligned with reclaim clock so .partial is not swept as ancient
  const basename = "ide-context-stall.json";
  let paused: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    paused = r;
  });

  const publish = publishIdeContextTemp(fs, {
    dir: "/tmp/agent-ide-context",
    basename,
    bytes: Buffer.from('{"ok":true}'),
    owner: "markdownWorkshop",
    sessionId: "pub",
    now: () => now,
    leaseMs: 5_000,
    onAfterFinalRevalidated: async () => {
      await gate;
      // Disarm after first suspension so the next successful revalidation can publish.
      return false;
    },
  });

  // Allow publisher to reach post-revalidate hook
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  // Advance past leaseUntil; sibling reclaims expired orphan/lease
  now += 10_000;
  await reclaimEligible(fs, "/tmp/agent-ide-context", () => now, {
    maxFiles: 8,
    maxBytes: 2 * 1024 * 1024,
  });
  assert.equal(fs.exists(basename), false, "final must not exist during stall");
  assert.equal(
    fs.exists(basename + ".lease"),
    false,
    "expired lease reclaimed during stall",
  );
  // Resume publisher — must reacquire lease then publish (never unleased final)
  paused!();
  const result = await publish;
  assert.ok(
    "finalPath" in result,
    "expected reacquire→publish after disarming stall hook",
  );
  assert.equal(fs.exists(basename), true);
  assert.equal(fs.exists(basename + ".lease"), true);
  const lease = JSON.parse(fs.read(basename + ".lease"));
  assert.ok(Date.parse(lease.leaseUntil) > now);
});

test("commitFinalPayload production path has no await between revalidate success and rename", async () => {
  // Behavioral: without the suspension hook, publish completes with lease present
  const fs = new MemoryTempFs();
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const result = await publishIdeContextTemp(fs, {
    dir: "/tmp/agent-ide-context",
    basename: "ide-context-noyield.json",
    bytes: Buffer.from("{}"),
    owner: "markdownWorkshop",
    sessionId: "ny",
    now: () => now,
    leaseMs: 60_000,
  });
  assert.ok("finalPath" in result);
  assert.equal(fs.exists("ide-context-noyield.json"), true);
  assert.equal(fs.exists("ide-context-noyield.json.lease"), true);
});
