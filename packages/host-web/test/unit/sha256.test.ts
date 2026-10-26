import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256 } from "../../src/sha256";

test("SHA-256 matches node:crypto, across block boundaries and in any script", () => {
  const texts = [
    "",
    "abc",
    "# Note\n\nSome text.",
    "é ü 漢字 🙂",
    ...[55, 56, 63, 64, 65, 119, 120, 1000].map((n) => "x".repeat(n)),
  ];
  for (const text of texts) {
    assert.equal(
      sha256(text),
      createHash("sha256").update(text).digest("hex"),
      JSON.stringify(text.slice(0, 20)),
    );
  }
});
