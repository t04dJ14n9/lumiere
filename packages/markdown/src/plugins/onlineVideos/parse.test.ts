import test from "node:test";
import assert from "node:assert/strict";
import { isVideoId, parseVideoUrl } from "./parse";

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
        kind: "video",
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

test("Bilibili UP space links give a space:{mid} id", () => {
  assert.deepEqual(parseVideoUrl("https://space.bilibili.com/2"), {
    provider: "bilibili",
    kind: "space",
    id: "space:2",
    page: "https://space.bilibili.com/2",
  });
  assert.deepEqual(parseVideoUrl("https://space.bilibili.com/2/"), {
    provider: "bilibili",
    kind: "space",
    id: "space:2",
    page: "https://space.bilibili.com/2",
  });
  assert.deepEqual(parseVideoUrl("https://m.bilibili.com/space/2"), {
    provider: "bilibili",
    kind: "space",
    id: "space:2",
    page: "https://space.bilibili.com/2",
  });
  assert.equal(isVideoId("bilibili", "space:2", "space"), true);
  assert.equal(isVideoId("bilibili", "space:2"), false);
  assert.equal(isVideoId("bilibili", "space:0", "space"), false);
  assert.equal(isVideoId("bilibili", "BV1DRHU6LELy", "space"), false);
});

test("Bilibili live room links give a live:{room} id", () => {
  assert.deepEqual(parseVideoUrl("https://live.bilibili.com/3"), {
    provider: "bilibili",
    kind: "live",
    id: "live:3",
    page: "https://live.bilibili.com/3",
  });
  assert.deepEqual(parseVideoUrl("https://live.bilibili.com/23058/"), {
    provider: "bilibili",
    kind: "live",
    id: "live:23058",
    page: "https://live.bilibili.com/23058",
  });
  assert.deepEqual(parseVideoUrl("https://www.live.bilibili.com/3"), {
    provider: "bilibili",
    kind: "live",
    id: "live:3",
    page: "https://live.bilibili.com/3",
  });
  assert.equal(isVideoId("bilibili", "live:3", "live"), true);
  assert.equal(isVideoId("bilibili", "live:3"), false);
  assert.equal(isVideoId("bilibili", "live:0", "live"), false);
  assert.equal(isVideoId("bilibili", "BV1DRHU6LELy", "live"), false);
});

test("Bilibili BV and av links keep the part number", () => {
  assert.deepEqual(
    parseVideoUrl("https://www.bilibili.com/video/BV1DRHU6LELy/?spm_id_from=x"),
    {
      provider: "bilibili",
      kind: "video",
      id: "BV1DRHU6LELy",
      part: 1,
      page: "https://www.bilibili.com/video/BV1DRHU6LELy/",
    },
  );
  assert.deepEqual(parseVideoUrl("https://m.bilibili.com/video/av170001?p=3"), {
    provider: "bilibili",
    kind: "video",
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
    kind: "video",
    id: "google/gemma-2-2b",
    page: "https://huggingface.co/google/gemma-2-2b",
  });
  assert.deepEqual(
    parseVideoUrl("https://www.huggingface.co/google/gemma-2-2b/tree/main"),
    {
      provider: "huggingface",
      kind: "video",
      id: "google/gemma-2-2b",
      page: "https://huggingface.co/google/gemma-2-2b",
    },
  );
  assert.deepEqual(parseVideoUrl("https://huggingface.co/bert-base-uncased"), {
    provider: "huggingface",
    kind: "video",
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

test("YouTube playlist links give the playlist ID", () => {
  const list = "PLrAXtmRdnEQy6nuLMVjHUkRUhDiXqVc1J";
  for (const link of [
    `https://www.youtube.com/playlist?list=${list}`,
    `https://youtube.com/playlist?list=${list}`,
    `https://www.youtube.com/embed/videoseries?list=${list}`,
    `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
  ]) {
    assert.deepEqual(parseVideoUrl(link), {
      provider: "youtube",
      kind: "playlist",
      id: list,
      page: `https://www.youtube.com/playlist?list=${list}`,
    });
  }
  // Watch with v= stays a video even when list= is present.
  assert.deepEqual(
    parseVideoUrl(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${list}`),
    {
      provider: "youtube",
      kind: "video",
      id: "dQw4w9WgXcQ",
      page: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  );
  assert.equal(
    parseVideoUrl("https://www.youtube.com/playlist?list=short"),
    undefined,
  );
});

test("Bilibili bangumi episode and season links", () => {
  assert.deepEqual(
    parseVideoUrl("https://www.bilibili.com/bangumi/play/ep409506"),
    {
      provider: "bilibili",
      kind: "bangumi",
      id: "ep409506",
      page: "https://www.bilibili.com/bangumi/play/ep409506",
    },
  );
  assert.deepEqual(
    parseVideoUrl("https://m.bilibili.com/bangumi/play/ss40154/?from=x"),
    {
      provider: "bilibili",
      kind: "bangumi",
      id: "ss40154",
      page: "https://www.bilibili.com/bangumi/play/ss40154",
    },
  );
  assert.equal(
    parseVideoUrl("https://www.bilibili.com/bangumi/play/EP409506")?.id,
    "ep409506",
  );
  assert.equal(
    parseVideoUrl("https://www.bilibili.com/bangumi/play/ep1")?.id,
    "ep1",
  );
});

test("YouTube channel UC and @handle links", () => {
  const uc = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
  assert.deepEqual(parseVideoUrl(`https://www.youtube.com/channel/${uc}`), {
    provider: "youtube",
    kind: "channel",
    id: uc,
    page: `https://www.youtube.com/channel/${uc}`,
  });
  assert.deepEqual(parseVideoUrl("https://www.youtube.com/@GoogleDevelopers"), {
    provider: "youtube",
    kind: "channel",
    id: "@GoogleDevelopers",
    page: "https://www.youtube.com/@GoogleDevelopers",
  });
  assert.deepEqual(
    parseVideoUrl("https://m.youtube.com/@GoogleDevelopers/videos"),
    undefined,
  );
  assert.deepEqual(
    parseVideoUrl("https://www.youtube.com/c/GoogleDevelopers"),
    {
      provider: "youtube",
      kind: "channel",
      id: "c:GoogleDevelopers",
      page: "https://www.youtube.com/c/GoogleDevelopers",
    },
  );
  assert.deepEqual(
    parseVideoUrl("https://www.youtube.com/user/GoogleDevelopers/"),
    {
      provider: "youtube",
      kind: "channel",
      id: "user:GoogleDevelopers",
      page: "https://www.youtube.com/user/GoogleDevelopers",
    },
  );
  assert.equal(parseVideoUrl("https://www.youtube.com/c/x"), undefined);
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
    "https://www.bilibili.com/bangumi/play/ep0",
    "https://www.bilibili.com/bangumi/play/epid123",
    "https://www.bilibili.com/bangumi/media/md28235858",
    "https://space.bilibili.com/video/BV1DRHU6LELy",
    "https://space.bilibili.com/0",
    "https://live.bilibili.com/",
    "https://live.bilibili.com/0",
    "https://live.bilibili.com/3/extra",
    "https://space.bilibili.com/2/video",
    "https://space.bilibili.com/",
    "https://m.bilibili.com/space/",
    "https://huggingface.co.evil.test/google/gemma-2-2b",
    "https://huggingface.co/datasets/squad",
    "https://huggingface.co/spaces/foo/bar",
    "https://hf.co/google/gemma-2-2b",
    "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
    "https://soundcloud.com/discover/sets/charts-top",
  ]) {
    assert.equal(parseVideoUrl(link), undefined, link);
  }
});

test("Spotify track, album, playlist, episode and show links", () => {
  const id = "11dFghVXANMlKmJXsNCbNl";
  assert.deepEqual(parseVideoUrl(`https://open.spotify.com/track/${id}`), {
    provider: "spotify",
    kind: "video",
    id: `track:${id}`,
    page: `https://open.spotify.com/track/${id}`,
  });
  assert.deepEqual(
    parseVideoUrl(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x",
    ),
    {
      provider: "spotify",
      kind: "video",
      id: "playlist:37i9dQZF1DXcBWIGoYBM5M",
      page: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    },
  );
  assert.equal(
    parseVideoUrl(`https://open.spotify.com/track/${id.slice(0, 10)}`),
    undefined,
  );
  assert.equal(
    parseVideoUrl("https://spotify.com/track/11dFghVXANMlKmJXsNCbNl"),
    undefined,
  );
});

test("SoundCloud track and set links", () => {
  assert.deepEqual(parseVideoUrl("https://soundcloud.com/forss/flickermood"), {
    provider: "soundcloud",
    kind: "video",
    id: "forss/flickermood",
    page: "https://soundcloud.com/forss/flickermood",
  });
  assert.deepEqual(
    parseVideoUrl("https://www.soundcloud.com/forss/sets/soulhack/?in=x"),
    {
      provider: "soundcloud",
      kind: "video",
      id: "forss/sets/soulhack",
      page: "https://soundcloud.com/forss/sets/soulhack",
    },
  );
  assert.equal(
    parseVideoUrl("https://soundcloud.com/discover/sets/charts-top"),
    undefined,
  );
  assert.equal(
    parseVideoUrl("https://soundcloud.com/forss/flickermood/comments"),
    undefined,
  );
});

test("npm package pages, scoped and versioned", () => {
  assert.deepEqual(parseVideoUrl("https://www.npmjs.com/package/lodash"), {
    provider: "npm",
    kind: "video",
    id: "lodash",
    page: "https://www.npmjs.com/package/lodash",
  });
  assert.deepEqual(parseVideoUrl("https://npmjs.com/package/Lodash/"), {
    provider: "npm",
    kind: "video",
    id: "lodash",
    page: "https://www.npmjs.com/package/lodash",
  });
  assert.deepEqual(parseVideoUrl("https://www.npmjs.com/package/@babel/core"), {
    provider: "npm",
    kind: "video",
    id: "@babel/core",
    page: "https://www.npmjs.com/package/@babel/core",
  });
  assert.deepEqual(
    parseVideoUrl("https://www.npmjs.com/package/lodash/v/4.17.21"),
    {
      provider: "npm",
      kind: "video",
      id: "lodash",
      page: "https://www.npmjs.com/package/lodash",
    },
  );
  assert.equal(
    parseVideoUrl("https://www.npmjs.com/package/.hidden"),
    undefined,
  );
  assert.equal(
    parseVideoUrl("https://www.npmjs.com/search?q=lodash"),
    undefined,
  );
  assert.equal(parseVideoUrl("https://registry.npmjs.org/lodash"), undefined);
});
