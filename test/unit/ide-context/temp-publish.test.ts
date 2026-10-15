import test from "node:test";
import assert from "node:assert/strict";
import { MemoryTempFs } from "./memory-temp-fs";
import { publishIdeContextTemp } from "../../../src/shared/ide-context/temp-publish";

test("publish: final payload name is not visible until lease sidecar exists", async () => {
  const fs = new MemoryTempFs();
  const observed: string[] = [];
  fs.onAfterWrite = (name) => observed.push(name);
  await publishIdeContextTemp(fs, {
    dir: "/tmp/agent-ide-context",
    basename: "ide-context-abc123.json",
    bytes: Buffer.from("{}"),
    owner: "markdownWorkshop",
    sessionId: "s1",
    now: () => Date.parse("2026-10-16T00:00:00.000Z"),
    leaseMs: 60_000,
  });
  const leaseIdx = observed.findIndex((n) => n.endsWith(".json.lease"));
  const finalIdx = observed.findIndex(
    (n) => n.endsWith("ide-context-abc123.json") && !n.includes(".partial") && !n.endsWith(".lease"),
  );
  assert.ok(leaseIdx >= 0 && finalIdx >= 0);
  assert.ok(leaseIdx < finalIdx, "lease final name before payload final name");
  assert.ok(observed.some((n) => n.includes(".partial") || n.includes(".tmp")));
});

test("publish: crash after lease before final leaves orphan lease only (no final payload)", async () => {
  const fs = new MemoryTempFs();
  await assert.rejects(() =>
    publishIdeContextTemp(fs, {
      dir: "/tmp/agent-ide-context",
      basename: "ide-context-crash.json",
      bytes: Buffer.from("{}"),
      owner: "pdfWorkshop",
      sessionId: "s2",
      now: () => 1_000_000,
      leaseMs: 60_000,
      onAfterLeasePublished: () => {
        throw new Error("boom");
      },
    }),
  );
  assert.equal(fs.exists("ide-context-crash.json"), false);
  assert.equal(fs.exists("ide-context-crash.json.lease"), true);
});
