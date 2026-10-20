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

test("X/Twitter status links (twitter.com and x.com)", () => {
  assert.deepEqual(parseVideoUrl("https://twitter.com/jack/status/20"), {
    provider: "twitter",
    id: "20",
    page: "https://x.com/i/status/20",
  });
  assert.deepEqual(parseVideoUrl("https://x.com/jack/status/20?s=20&t=abc"), {
    provider: "twitter",
    id: "20",
    page: "https://x.com/i/status/20",
  });
  assert.deepEqual(
    parseVideoUrl(
      "https://mobile.twitter.com/OpenAI/statuses/1633128396691423232/",
    ),
    {
      provider: "twitter",
      id: "1633128396691423232",
      page: "https://x.com/i/status/1633128396691423232",
    },
  );
  assert.deepEqual(parseVideoUrl("https://www.x.com/i/status/20"), {
    provider: "twitter",
    id: "20",
    page: "https://x.com/i/status/20",
  });
  assert.deepEqual(parseVideoUrl("https://twitter.com/i/web/status/20"), {
    provider: "twitter",
    id: "20",
    page: "https://x.com/i/status/20",
  });
  assert.equal(parseVideoUrl("https://twitter.com/jack"), undefined);
  assert.equal(parseVideoUrl("https://twitter.com/jack/status/0"), undefined);
  assert.equal(
    parseVideoUrl("https://twitter.com/jack/status/20/photo/1"),
    undefined,
  );
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
    "https://twitter.com/jack",
    "https://twitter.com/intent/tweet",
    "https://x.com/i/communities/1",
    "https://twitter.com.evil.test/jack/status/20",
  ]) {
    assert.equal(parseVideoUrl(link), undefined, link);
  }
});
