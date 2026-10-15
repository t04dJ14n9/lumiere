import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Keep these files byte-identical with PDF Workshop. */
const PINNED: Record<string, string> = {
  "docs/ide-context-packet.md":
    "9a769b58c9492d080e884acdf78d29edfd026b8ba9ec278bbcfd5f7d8807a761",
  "test/fixtures/ide-context-packet.json":
    "e679afc5445527f24a3483c3de53bd2e1ecd1256ef769c11067f7a0623002e15",
  "src/shared/ide-context/canonical.ts":
    "1270579cb3848b73e84e7abac182fe8d2f3c3f9e8b5e495dcb5635f84c8d8082",
  "src/shared/ide-context/caps.ts":
    "541258fc320412a4eeb30d7fba7cf779e50f8b7245a7907707b971ccdeb5e712",
  "src/shared/ide-context/gather.ts":
    "46b45260c9c00b44d49e169628bccafe437f1847e2b327ac809c35a76084b923",
  "src/shared/ide-context/index.ts":
    "15263a832e778057955a6cb0d4f9c5169309e20240349c281a22bf9102a1d079",
  "src/shared/ide-context/render.ts":
    "64e4cea7fabc2da53e75d641b872b3647321f7c00e4870faf4191ad8b90d068d",
  "src/shared/ide-context/resolve-target.ts":
    "985b8338f2e90a995a61ae7f4dd587cff2ac8806c651f40a97a62a73bdefcdc5",
  "src/shared/ide-context/scrub.ts":
    "eb39d23e86b8bb02039abcd33236c237195a2a0fdad77464f24cfce5417e793b",
  "src/shared/ide-context/temp-lease.ts":
    "62d979701d1b8f76e0aa0b8757508211201e34caf26f900c7e470dcccbe4d142",
  "src/shared/ide-context/temp-publish.ts":
    "19e55a6d5932d5c50327ae7b2a6c7f9b97bf68ddc0eadc717a1945a25836d4a7",
  "src/shared/ide-context/temp-reclaim.ts":
    "c718d1a49e6e57d47edd52d531f31695f3bc85a78dabebfdf2f0406ac23b62d6",
  "src/shared/ide-context/truncate.ts":
    "1d3fbf4d5a295dff745aaddbb9ebc7b17a97c17c2a00c2b9224e3976b5dac880",
  "src/shared/ide-context/types.ts":
    "e6186c6d570840ca534cb3720c0d3cb1784d43ae86f34110dafe87449d4e7a22",
};

test("ide-context twin files match pinned SHA-256 (sync PDF Workshop)", () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    assert.equal(actual, hash, `${file} changed; update PDF Workshop twin too`);
  }
});
