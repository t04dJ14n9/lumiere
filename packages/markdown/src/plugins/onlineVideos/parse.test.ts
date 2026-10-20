import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoUrl } from "./parse";

const ID = "dQw4w9WgXcQ";

test("YouTube watch, youtu.be, Shorts, embed and live links give the video ID", () => {
  for (const link of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `http://www.youtube-nocookie.com/embed/${ID}/`,
  ]) {
    assert.deepEqual(
      parseVideoUrl(link),
      {
        provider: "youtube",
        id: ID,
        page: `https://www.youtube.com/watch?v=${ID}`,
      },
      link,
    );
  }
});

test("YouTube start times in seconds or h/m/s", () => {
  assert.equal(parseVideoUrl(`https://youtu.be/${ID}?t=90`)?.start, 90);
  assert.equal(
    parseVideoUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.start,
    90,
  );
  assert.equal(
    parseVideoUrl(`https://www.youtube.com/embed/${ID}?start=3723`)?.page,
    `https://www.youtube.com/watch?v=${ID}&t=3723s`,
  );
  assert.equal(
    parseVideoUrl(`https://youtu.be/${ID}?t=soon`)?.start,
    undefined,
  );
  assert.equal(parseVideoUrl(`https://youtu.be/${ID}?t=0`)?.start, undefined);
});

test("Niconico watch and nico.ms links give the sm/nm/so id", () => {
  assert.deepEqual(parseVideoUrl("https://www.nicovideo.jp/watch/sm9"), {
    provider: "niconico",
    id: "sm9",
    page: "https://www.nicovideo.jp/watch/sm9",
  });
  assert.deepEqual(parseVideoUrl("https://nico.ms/sm2057168"), {
    provider: "niconico",
    id: "sm2057168",
    page: "https://www.nicovideo.jp/watch/sm2057168",
  });
  assert.deepEqual(parseVideoUrl("https://sp.nicovideo.jp/watch/nm14232"), {
    provider: "niconico",
    id: "nm14232",
    page: "https://www.nicovideo.jp/watch/nm14232",
  });
  assert.equal(
    parseVideoUrl("https://www.nicovideo.jp/watch/sm9?from=90")?.start,
    90,
  );
  assert.equal(
    parseVideoUrl("https://www.nicovideo.jp/watch/sm9?from=90")?.page,
    "https://www.nicovideo.jp/watch/sm9?from=90",
  );
});

test("Bilibili BV and av links keep the part number", () => {
  assert.deepEqual(
    parseVideoUrl("https://www.bilibili.com/video/BV1DRHU6LELy/?spm_id_from=x"),
    {
      provider: "bilibili",
      id: "BV1DRHU6LELy",
      part: 1,
      page: "https://www.bilibili.com/video/BV1DRHU6LELy/",
    },
  );
  assert.deepEqual(parseVideoUrl("https://m.bilibili.com/video/av170001?p=3"), {
    provider: "bilibili",
    id: "av170001",
    part: 3,
    page: "https://www.bilibili.com/video/av170001/?p=3",
  });
  assert.equal(
    parseVideoUrl("https://bilibili.com/video/AV170001")?.id,
    "av170001",
  );
  assert.equal(
    parseVideoUrl("https://www.bilibili.com/video/BV1DRHU6LELy?p=0")?.part,
    1,
  );
  assert.equal(
    parseVideoUrl("https://www.bilibili.com/video/BV1DRHU6LELy?p=2x")?.part,
    1,
  );
});

test("Hugging Face model pages, owner/name and tree paths", () => {
  assert.deepEqual(parseVideoUrl("https://huggingface.co/google/gemma-2-2b"), {
    provider: "huggingface",
    id: "google/gemma-2-2b",
    page: "https://huggingface.co/google/gemma-2-2b",
  });
  assert.deepEqual(
    parseVideoUrl("https://www.huggingface.co/google/gemma-2-2b/tree/main"),
    {
      provider: "huggingface",
      id: "google/gemma-2-2b",
      page: "https://huggingface.co/google/gemma-2-2b",
    },
  );
  assert.deepEqual(parseVideoUrl("https://huggingface.co/bert-base-uncased"), {
    provider: "huggingface",
    id: "bert-base-uncased",
    page: "https://huggingface.co/bert-base-uncased",
  });
  assert.equal(
    parseVideoUrl("https://huggingface.co/datasets/squad"),
    undefined,
  );
  assert.equal(
    parseVideoUrl("https://huggingface.co/spaces/foo/bar"),
    undefined,
  );
  assert.equal(parseVideoUrl("https://hf.co/google/gemma-2-2b"), undefined);
});

test("anything that is not a well-formed video link is left alone", () => {
  for (const link of [
    "clip.mp4",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil.test/?u=https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload",
    'https://youtu.be/dQw4w9WgXc"',
    "https://www.youtube.com/channel/UC123",
    "https://www.youtube.com/watch",
    "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
    "ftp://youtu.be/dQw4w9WgXcQ",
    "https://user:pass@youtu.be/dQw4w9WgXcQ",
    "https://youtu.be:8443/dQw4w9WgXcQ",
    "https://www.bilibili.com/video/BV1DRHU6LEL",
    "https://www.bilibili.com/video/BV1DRHU6LELy/extra",
    "https://www.bilibili.com/video/av0",
    "https://www.bilibili.com/bangumi/play/ep1",
    "https://space.bilibili.com/video/BV1DRHU6LELy",
    "https://huggingface.co.evil.test/google/gemma-2-2b",
    "https://huggingface.co/datasets/squad",
    "https://huggingface.co/spaces/foo/bar",
    "https://hf.co/google/gemma-2-2b",
    "https://www.nicovideo.jp/watch/",
    "https://www.nicovideo.jp/watch/sm0",
    "https://www.nicovideo.jp/watch/sm9/extra",
    "https://evil.nicovideo.jp.evil.test/watch/sm9",
    "https://nico.ms/sm",
    "https://www.nicovideo.jp/tag/sm9",
  ]) {
    assert.equal(parseVideoUrl(link), undefined, link);
  }
});
