import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Keep these files byte-identical with PDF Workshop. */
const PINNED: Record<string, string> = {
  "src/shared/ide-context/host-apis.ts":
    "538488c9c6bae793bf25f78a81659213c98c0a0ae1a3cf58702ff6589fde9883",
  "docs/ide-context-packet.md":
    "9a769b58c9492d080e884acdf78d29edfd026b8ba9ec278bbcfd5f7d8807a761",
  "test/fixtures/ide-context-packet.json":
    "e679afc5445527f24a3483c3de53bd2e1ecd1256ef769c11067f7a0623002e15",
  "src/shared/ide-context/canonical.ts":
    "a7c103d2288fe41dad334dd7577721762ac1fe588ac801157ac713c2d8138814",
  "src/shared/ide-context/caps.ts":
    "541258fc320412a4eeb30d7fba7cf779e50f8b7245a7907707b971ccdeb5e712",
  "src/shared/ide-context/gather.ts":
    "c5ead66997ffe5053870dcfb572cd7eb5f645915ab6b86209d326634fc6de0dd",
  "src/shared/ide-context/index.ts":
    "4f8ddbe26ddc09edbccf30c33f3de3636b3842660b7ba52b8dce2672bfa88ae5",
  "src/shared/ide-context/render.ts":
    "f06280ca2be861b2c094918a510f3a805ba6a4887e474b88bc2859a49d8d81f8",
  "src/shared/ide-context/resolve-target.ts":
    "df2c67d3a76bda1eeaff10e0615f9b800581291105b4521189ad77658b2e0a30",
  "src/shared/ide-context/scrub.ts":
    "fcc827400df54872f1055e47d63513bcac0d109781176928d7217e9c244fc0cb",
  "src/shared/ide-context/temp-lease.ts":
    "d6a945c18152e9597cf133e72db97e8d2ee9b49e401f8348b84497f9d2c4c732",
  "src/shared/ide-context/temp-publish.ts":
    "d8e95e41daf572e6b6c884b556dbb8c1dce717d52fbc2565bbd299cb7a8c045d",
  "src/shared/ide-context/temp-reclaim.ts":
    "a958406589e1dd0adccc0c24a4ee0d6674cdfc3608d1e75e4f87256911f7ecd7",
  "src/shared/ide-context/truncate.ts":
    "c303d1777c05636ae3f1532e0f296b16a8ffab6c88bb6e06694219d2d2bedab2",
  "src/shared/ide-context/types.ts":
    "e6186c6d570840ca534cb3720c0d3cb1784d43ae86f34110dafe87449d4e7a22",
};

test("ide-context twin files match pinned SHA-256 (sync PDF Workshop)", () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    assert.equal(actual, hash, `${file} changed; update PDF Workshop twin too`);
  }
});
