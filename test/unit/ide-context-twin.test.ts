import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Keep these files byte-identical with Markdown Workshop. */
const PINNED: Record<string, string> = {
  "src/shared/ide-context/host-apis.ts":
    "538488c9c6bae793bf25f78a81659213c98c0a0ae1a3cf58702ff6589fde9883",
  "docs/ide-context-packet.md":
    "9a769b58c9492d080e884acdf78d29edfd026b8ba9ec278bbcfd5f7d8807a761",
  "test/fixtures/ide-context-packet.json":
    "e679afc5445527f24a3483c3de53bd2e1ecd1256ef769c11067f7a0623002e15",
  "src/shared/ide-context/canonical.ts":
    "4d97b9adfb0a346e1cd66168abcf6115c9038913ca5443e26dc251d32d0cfc27",
  "src/shared/ide-context/caps.ts":
    "541258fc320412a4eeb30d7fba7cf779e50f8b7245a7907707b971ccdeb5e712",
  "src/shared/ide-context/gather.ts":
    "3ced13fa744c0f9691453bc434ae17f642a6fd0d7629cd96e1d357f32bcc983f",
  "src/shared/ide-context/index.ts":
    "4f8ddbe26ddc09edbccf30c33f3de3636b3842660b7ba52b8dce2672bfa88ae5",
  "src/shared/ide-context/render.ts":
    "16415de8c6a06b174de5af1fb6eacfc3133d97c105dead745b6bf334a3d75c61",
  "src/shared/ide-context/resolve-target.ts":
    "8a5ec640d19b2818877101c53a67e0b71aa8d70bbb215c134e8166142415943b",
  "src/shared/ide-context/scrub.ts":
    "fc6a726ea58a5aa502bf60dac56c8de2dcb27b0bbd00ddb1e5c01ec54d905f88",
  "src/shared/ide-context/temp-lease.ts":
    "e3bb7c3b4e3adf02fe31cd743b7f300b3437776fb5fcb7b174158681fb15010a",
  "src/shared/ide-context/temp-publish.ts":
    "b85cba56f90bfb8143baa269585cbca82ba44b7d54ab5bcf1837c7348fb53f40",
  "src/shared/ide-context/temp-reclaim.ts":
    "fad156c0eebca14812abb748ebc38afae9e0a0784af2904fc295a77fc0df5d6b",
  "src/shared/ide-context/truncate.ts":
    "e0716ec68808af89702155b6d9bed7397bfe0dd1ad47371206950a6714d79c20",
  "src/shared/ide-context/truncate-fields.ts":
    "a529eabf733d4e7f5c130af94b1f5e24c973e88ac2df6b9a13d7f5a02e5397fa",
  "src/shared/ide-context/types.ts":
    "e6186c6d570840ca534cb3720c0d3cb1784d43ae86f34110dafe87449d4e7a22",
};

test("ide-context twin files match pinned SHA-256 (sync Markdown Workshop)", () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    assert.equal(
      actual,
      hash,
      `${file} changed; update Markdown Workshop twin too`,
    );
  }
});
