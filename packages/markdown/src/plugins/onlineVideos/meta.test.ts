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

test("playlist meta labels the kind before author or id", () => {
  assert.equal(
    videoMeta("YouTube", "PLrAXtmRdnEQy6nuLMVjHUkRUhDiXqVc1J", {}, "playlist"),
    "YouTube · Playlist",
  );
  assert.equal(
    videoMeta(
      "YouTube",
      "PLrAXtmRdnEQy6nuLMVjHUkRUhDiXqVc1J",
      { author: "Redlist" },
      "playlist",
    ),
    "YouTube · Playlist · Redlist",
  );
});

test("bangumi meta labels the kind before author or id", () => {
  assert.equal(
    videoMeta("Bilibili", "ep409506", {}, "bangumi"),
    "Bilibili · Bangumi",
  );
  assert.equal(
    videoMeta(
      "Bilibili",
      "ep409506",
      { author: "哔哩哔哩番剧", duration: 1441 },
      "bangumi",
    ),
    "Bilibili · Bangumi · 哔哩哔哩番剧 · 24:01",
  );
});

test("channel meta labels the kind before author or id", () => {
  assert.equal(
    videoMeta("YouTube", "UC_x5XG1OV2P6uZZ5FSM9Ttw", {}, "channel"),
    "YouTube · Channel",
  );
});

test("space meta labels the kind before author or id", () => {
  assert.equal(
    videoMeta("Bilibili", "space:2", {}, "space"),
    "Bilibili · Space",
  );
  assert.equal(
    videoMeta("Bilibili", "space:2", { title: "碧诗" }, "space"),
    "Bilibili · Space",
  );
});
