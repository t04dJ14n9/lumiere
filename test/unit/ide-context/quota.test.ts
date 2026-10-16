import test from "node:test";
import assert from "node:assert/strict";
import { MemoryTempFs } from "./memory-temp-fs";
import { publishIdeContextTemp } from "../../../src/shared/ide-context/temp-publish";
import {
  writeLeaseAtomic,
  leasePathFor,
} from "../../../src/shared/ide-context/temp-lease";

test("quota full of leased finals soft-fails new publish without unlinking leases", async () => {
  const fs = new MemoryTempFs();
  const dir = "/tmp/agent-ide-context";
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < 8; i++) {
    const base = `${dir}/ide-context-filled-${i}.json`;
    await fs.writeFile(base, Buffer.from(`{"i":${i}}`));
    await writeLeaseAtomic(fs, leasePathFor(base), {
      leaseUntil: new Date(now + 60_000).toISOString(),
      owner: "markdownWorkshop",
      sessionId: `fill-${i}`,
    });
  }
  const before = (await fs.listNames(dir)).filter(
    (n) => n.endsWith(".json") && !n.includes(".partial"),
  );
  assert.equal(before.length, 8);

  const result = await publishIdeContextTemp(fs, {
    dir,
    basename: "ide-context-new.json",
    bytes: Buffer.from('{"new":true}'),
    owner: "pdfWorkshop",
    sessionId: "new",
    now: () => now,
    leaseMs: 60_000,
    reclaimCaps: { maxFiles: 8, maxBytes: 2 * 1024 * 1024 },
  });
  assert.equal("skipped" in result && result.skipped, true);
  if ("skipped" in result) {
    assert.match(result.warning, /quota full|lease-protected/i);
  }
  assert.equal(fs.exists("ide-context-new.json"), false);
  for (let i = 0; i < 8; i++) {
    assert.equal(
      fs.exists(`ide-context-filled-${i}.json`),
      true,
      `filled ${i} kept`,
    );
    assert.equal(fs.exists(`ide-context-filled-${i}.json.lease`), true);
  }
});
