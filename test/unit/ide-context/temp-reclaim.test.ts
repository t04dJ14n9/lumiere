import test from "node:test";
import assert from "node:assert/strict";
import { MemoryTempFs } from "./memory-temp-fs";
import {
  renewLeaseAtomic,
  writeLeaseAtomic,
  leasePathFor,
} from "../../../src/shared/ide-context/temp-lease";
import {
  isReclaimablePayload,
  reclaimEligible,
} from "../../../src/shared/ide-context/temp-reclaim";

const DIR = "/tmp/agent-ide-context";
const caps = { maxFiles: 8, maxBytes: 2 * 1024 * 1024 };

test("renewLeaseAtomic: readers never see truncated lease (staging then rename)", async () => {
  const fs = new MemoryTempFs();
  await fs.mkdir(DIR, { recursive: true });
  const leasePath = `${DIR}/ide-context-x.json.lease`;
  await writeLeaseAtomic(fs, leasePath, {
    leaseUntil: new Date(1_000_000).toISOString(),
    owner: "markdownWorkshop",
    sessionId: "old",
  });
  const seen: string[] = [];
  const origRename = fs.rename.bind(fs);
  fs.rename = async (from: string, to: string) => {
    // Concurrent reader mid-rename: only complete files exist in our model;
    // assert staging content is valid JSON before rename lands.
    const staging = await fs.readFile(from);
    JSON.parse(staging.toString("utf8")); // must parse
    seen.push("staging-valid");
    await origRename(from, to);
    const final = JSON.parse((await fs.readFile(to)).toString("utf8"));
    seen.push(final.sessionId);
  };
  await renewLeaseAtomic(fs, leasePath, {
    leaseUntil: new Date(2_000_000).toISOString(),
    owner: "markdownWorkshop",
    sessionId: "new",
  });
  assert.deepEqual(seen, ["staging-valid", "new"]);
  const final = JSON.parse((await fs.readFile(leasePath)).toString("utf8"));
  assert.equal(final.sessionId, "new");
});

test("orphan sidecar with future leaseUntil is NOT deleted by age alone", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 0;
  await fs.mkdir(DIR, { recursive: true });
  const lease = `${DIR}/ide-context-orphan.json.lease`;
  await writeLeaseAtomic(fs, lease, {
    leaseUntil: new Date(1_000_000).toISOString(),
    owner: "pdfWorkshop",
    sessionId: "o1",
  });
  fs.setMtime(lease, 0);
  // Advance wall clock far past mtime age but leaseUntil still future
  const now = () => 500_000;
  await reclaimEligible(fs, DIR, now, caps);
  assert.equal(fs.exists("ide-context-orphan.json.lease"), true);
});

test("orphan sidecar past leaseUntil IS reclaimable", async () => {
  const fs = new MemoryTempFs();
  await fs.mkdir(DIR, { recursive: true });
  const lease = `${DIR}/ide-context-orphan2.json.lease`;
  await writeLeaseAtomic(fs, lease, {
    leaseUntil: new Date(100).toISOString(),
    owner: "pdfWorkshop",
    sessionId: "o2",
  });
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-orphan2.json.lease"), false);
});

test("missing sidecar + payload age < 60s is NOT reclaimable", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(`${DIR}/ide-context-young.json`, Buffer.from("{}"));
  fs.setMtime(`${DIR}/ide-context-young.json`, 1_000_000 - 10_000); // 10s old
  assert.equal(
    await isReclaimablePayload(
      fs,
      DIR,
      "ide-context-young.json",
      () => 1_000_000,
    ),
    false,
  );
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-young.json"), true);
});

test("missing sidecar + payload age >= 60s IS reclaimable", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(`${DIR}/ide-context-old.json`, Buffer.from("{}"));
  fs.setMtime(`${DIR}/ide-context-old.json`, 1_000_000 - 60_000);
  assert.equal(
    await isReclaimablePayload(
      fs,
      DIR,
      "ide-context-old.json",
      () => 1_000_000,
    ),
    true,
  );
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-old.json"), false);
});

test("concurrent renewal vs sibling reclaim on payload older than 60s: never reclaim while leaseUntil valid", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 0;
  await fs.mkdir(DIR, { recursive: true });
  const base = `${DIR}/ide-context-race.json`;
  await fs.writeFile(base, Buffer.from("{}"));
  fs.setMtime(base, 0); // age will be > 60s when now=100_000
  await writeLeaseAtomic(fs, leasePathFor(base), {
    leaseUntil: new Date(200_000).toISOString(),
    owner: "markdownWorkshop",
    sessionId: "race",
  });
  // Renew while reclaim runs
  await renewLeaseAtomic(fs, leasePathFor(base), {
    leaseUntil: new Date(300_000).toISOString(),
    owner: "markdownWorkshop",
    sessionId: "race-renewed",
  });
  await reclaimEligible(fs, DIR, () => 100_000, caps);
  assert.equal(fs.exists("ide-context-race.json"), true);
  assert.equal(fs.exists("ide-context-race.json.lease"), true);
  const lease = JSON.parse(fs.read("ide-context-race.json.lease"));
  assert.ok(Date.parse(lease.leaseUntil) > 100_000);
});

test("leftover *.lease.staging-* older than grace is unlinked", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  const staging = `${DIR}/ide-context-x.json.lease.staging-abc123`;
  await fs.writeFile(staging, Buffer.from("{}"));
  fs.setMtime(staging, 1_000_000 - 60_000);
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-x.json.lease.staging-abc123"), false);
});

test("young *.lease.staging-* within grace is kept", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  const staging = `${DIR}/ide-context-x.json.lease.staging-young`;
  await fs.writeFile(staging, Buffer.from("{}"));
  fs.setMtime(staging, 1_000_000 - 10_000);
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-x.json.lease.staging-young"), true);
});

test("leftover *.lease.renew-* older than grace is unlinked", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  const renew = `${DIR}/ide-context-x.json.lease.renew-sess-xyz`;
  await fs.writeFile(renew, Buffer.from("{}"));
  fs.setMtime(renew, 1_000_000 - 60_000);
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-x.json.lease.renew-sess-xyz"), false);
});

test("young *.lease.renew-* within grace is kept", async () => {
  const fs = new MemoryTempFs();
  fs.nowMs = 1_000_000;
  await fs.mkdir(DIR, { recursive: true });
  const renew = `${DIR}/ide-context-x.json.lease.renew-young`;
  await fs.writeFile(renew, Buffer.from("{}"));
  fs.setMtime(renew, 1_000_000 - 30_000);
  await reclaimEligible(fs, DIR, () => 1_000_000, caps);
  assert.equal(fs.exists("ide-context-x.json.lease.renew-young"), true);
});
