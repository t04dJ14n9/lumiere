import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, videoMeta } from "./meta";

test("lengths read like a player's clock", () => {
  assert.equal(formatDuration(257), "4:17");
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatDuration(3723), "1:02:03");
});

test("the card line shows author and length when known, else the ID", () => {
  assert.equal(
    videoMeta("Bilibili", "BV1DRHU6LELy"),
    "Bilibili · BV1DRHU6LELy",
  );
  assert.equal(
    videoMeta("Bilibili", "BV1DRHU6LELy", {
      author: "英雄联盟",
      duration: 257,
    }),
    "Bilibili · 英雄联盟 · 4:17",
  );
  assert.equal(
    videoMeta("YouTube", "dQw4w9WgXcQ", { title: "t", author: "Rick Astley" }),
    "YouTube · Rick Astley",
  );
});
