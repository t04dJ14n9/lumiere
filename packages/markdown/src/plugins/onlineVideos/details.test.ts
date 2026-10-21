import test from "node:test";
import assert from "node:assert/strict";
import type { Fetch, FetchResponse } from "./details";
import {
  USER_AGENT,
  VideoDetailsSource,
  coverUrl,
  imageDataUrl,
  parseBilibiliCard,
  parseBilibiliLive,
  parseBilibiliSeason,
  parseBilibiliView,
  parseHuggingFaceModel,
  parseOEmbed,
  oEmbedThumbnail,
  spotifyThumbnail,
  soundcloudThumbnail,
  vimeoThumbnail,
  npmRegistryPath,
  parseNpmPackage,
} from "./details";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COVER = "http://i0.hdslb.com/bfs/archive/4260b5a0d7a5.jpg";
const VIEW = {
  code: 0,
  message: "OK",
  data: {
    bvid: "BV1DRHU6LELy",
    pic: COVER,
    title: " 2026英雄联盟全球总决赛主题曲\n《KNOW MY NAME》 ",
    duration: 257,
    owner: { mid: 1, name: "英雄联盟" },
  },
};
const FACE =
  "http://i2.hdslb.com/bfs/face/ef0457addb241401e3367dc0e4bd0f495e369c79.jpg";
const CARD = {
  code: 0,
  message: "OK",
  data: {
    card: {
      mid: "2",
      name: " 碧诗 ",
      face: FACE,
      sign: "https://kami.im",
    },
  },
};
const KEYFRAME =
  "http://i0.hdslb.com/bfs/live-key-frame/keyframe040916010000000230589l8p96.jpg";
const LIVE = {
  code: 0,
  message: "ok",
  data: {
    room_id: 23058,
    short_id: 3,
    title: " 哔哩哔哩音悦台 ",
    user_cover: "",
    keyframe: KEYFRAME,
    live_status: 0,
  },
};

function response(
  body: unknown,
  {
    status = 200,
    type = "application/json",
    length,
  }: {
    status?: number;
    type?: string;
    length?: number;
  } = {},
): FetchResponse {
  const bytes =
    body instanceof Uint8Array
      ? body
      : new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name === "content-type"
          ? type
          : name === "content-length"
            ? String(length ?? bytes.byteLength)
            : null,
    },
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

/** A fake fetch answering by URL prefix and recording each request. */
function fakeFetch(
  routes: Record<string, () => FetchResponse | Promise<FetchResponse>>,
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!route) {
      throw new TypeError("fetch failed");
    }
    return routes[route]!();
  };
  return { fetch, calls };
}

test("Bilibili view responses give title, author, length and an https hdslb cover", () => {
  assert.deepEqual(parseBilibiliView(VIEW), {
    details: {
      title: "2026英雄联盟全球总决赛主题曲 《KNOW MY NAME》",
      author: "英雄联盟",
      duration: 257,
    },
    cover: "https://i0.hdslb.com/bfs/archive/4260b5a0d7a5.jpg",
  });
  assert.throws(() => parseBilibiliView({ code: -404, message: "啥都木有" }));
  assert.throws(() => parseBilibiliView("<html>412</html>"));
  assert.deepEqual(
    parseBilibiliView({ code: 0, data: { title: 7, duration: -1, pic: 3 } }),
    { details: {} },
  );
});

test("Bilibili multi-part pages append the part title and prefer its duration", () => {
  const multi = {
    ...VIEW,
    data: {
      ...VIEW.data,
      duration: 999,
      pages: [
        { page: 1, part: "开场", duration: 40 },
        { page: 2, part: "主题曲完整版", duration: 210 },
      ],
    },
  };
  assert.deepEqual(parseBilibiliView(multi, 2).details, {
    title: "2026英雄联盟全球总决赛主题曲 《KNOW MY NAME》 · 主题曲完整版",
    author: "英雄联盟",
    duration: 210,
  });
  assert.equal(
    parseBilibiliView(multi, 1).details.title?.includes("开场"),
    true,
  );
  // Single-page responses keep the series title only.
  assert.deepEqual(
    parseBilibiliView(
      {
        code: 0,
        data: {
          title: "Solo",
          pages: [{ page: 1, part: "Solo", duration: 12 }],
          owner: { name: "A" },
        },
      },
      1,
    ).details,
    { title: "Solo", author: "A", duration: 12 },
  );
});

test("Bilibili space card responses give the UP name and face cover", () => {
  assert.deepEqual(parseBilibiliCard(CARD), {
    details: { title: "碧诗" },
    cover:
      "https://i2.hdslb.com/bfs/face/ef0457addb241401e3367dc0e4bd0f495e369c79.jpg",
  });
  assert.throws(() => parseBilibiliCard({ code: -404 }));
  assert.deepEqual(
    parseBilibiliCard({ code: 0, data: { card: { name: 7, face: 3 } } }),
    { details: {} },
  );
});

test("Bilibili live responses give the room title and keyframe cover", () => {
  assert.deepEqual(parseBilibiliLive(LIVE), {
    details: { title: "哔哩哔哩音悦台" },
    cover:
      "https://i0.hdslb.com/bfs/live-key-frame/keyframe040916010000000230589l8p96.jpg",
  });
  assert.throws(() => parseBilibiliLive({ code: -404 }));
  assert.deepEqual(parseBilibiliLive({ code: 0, data: { title: 7 } }), {
    details: {},
  });
});

test("covers are accepted only from i0–i2.hdslb.com image paths", () => {
  assert.equal(
    coverUrl("https://i2.hdslb.com/bfs/archive/a_b-1.png"),
    "https://i2.hdslb.com/bfs/archive/a_b-1.png",
  );
  for (const value of [
    "https://i3.hdslb.com/bfs/archive/a.jpg",
    "https://evil.test/bfs/archive/a.jpg",
    "https://i0.hdslb.com.evil.test/bfs/a.jpg",
    "https://i0.hdslb.com/other/a.jpg",
    "https://i0.hdslb.com/bfs/a.jpg?x=1",
    "https://i0.hdslb.com:8080/bfs/a.jpg",
    "https://i0.hdslb.com/bfs/a.svg",
    "https://i0.hdslb.com/bfs/../a.jpg/..",
    "javascript:alert(1)",
    "",
    undefined,
  ]) {
    assert.equal(coverUrl(value), undefined, String(value));
  }
});

test("oEmbed responses give the YouTube title and channel", () => {
  assert.deepEqual(
    parseOEmbed({
      title: "Never Gonna Give You Up",
      author_name: "Rick Astley",
      html: "<iframe>",
    }),
    { title: "Never Gonna Give You Up", author: "Rick Astley" },
  );
  assert.deepEqual(
    parseOEmbed({
      title: "The Mountain",
      author_name: "TSO Photography",
      duration: 185,
    }),
    {
      title: "The Mountain",
      author: "TSO Photography",
      duration: 185,
    },
  );
  assert.throws(() => parseOEmbed(null));
  assert.deepEqual(parseOEmbed({ title: "" }), {});
});

test("data URLs are typed by the image's signature", () => {
  assert.match(imageDataUrl(JPEG), /^data:image\/jpeg;base64,/);
  assert.match(imageDataUrl(PNG), /^data:image\/png;base64,/);
  assert.throws(() => imageDataUrl(new TextEncoder().encode("<svg onload=x>")));
});

test("a Bilibili lookup fetches the view and a scaled cover with the extension's agent", async () => {
  const { fetch, calls } = fakeFetch({
    "https://api.bilibili.com/x/web-interface/view?bvid=BV1DRHU6LELy": () =>
      response(VIEW),
    "https://i0.hdslb.com/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "bilibili",
    "BV1DRHU6LELy",
  );
  assert.equal(details.title, "2026英雄联盟全球总决赛主题曲 《KNOW MY NAME》");
  assert.equal(details.author, "英雄联盟");
  assert.equal(details.duration, 257);
  assert.equal(
    details.cover,
    `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
  );
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://api.bilibili.com/x/web-interface/view?bvid=BV1DRHU6LELy",
      "https://i0.hdslb.com/bfs/archive/4260b5a0d7a5.jpg@480w_270h_1c.jpg",
    ],
  );
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

test("a Bilibili space lookup fetches the card API and a scaled face", async () => {
  const { fetch, calls } = fakeFetch({
    "https://api.bilibili.com/x/web-interface/card?mid=2": () => response(CARD),
    "https://i2.hdslb.com/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "bilibili",
    "space:2",
    "space",
  );
  assert.equal(details.title, "碧诗");
  assert.equal(
    details.cover,
    `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
  );
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://api.bilibili.com/x/web-interface/card?mid=2",
      "https://i2.hdslb.com/bfs/face/ef0457addb241401e3367dc0e4bd0f495e369c79.jpg@480w_270h_1c.jpg",
    ],
  );
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

test("a Bilibili live lookup fetches get_info and falls back to a raw keyframe", async () => {
  const keyframe =
    "https://i0.hdslb.com/bfs/live-key-frame/keyframe040916010000000230589l8p96.jpg";
  const { fetch, calls } = fakeFetch({
    "https://api.live.bilibili.com/room/v1/Room/get_info?room_id=3": () =>
      response(LIVE),
    [keyframe + "@480w_270h_1c.jpg"]: () => response({}, { status: 404 }),
    [keyframe]: () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "bilibili",
    "live:3",
    "live",
  );
  assert.equal(details.title, "哔哩哔哩音悦台");
  assert.equal(
    details.cover,
    `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
  );
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://api.live.bilibili.com/room/v1/Room/get_info?room_id=3",
      keyframe + "@480w_270h_1c.jpg",
      keyframe,
    ],
  );
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

test("av IDs use the aid query; YouTube uses keyless oEmbed", async () => {
  const { fetch, calls } = fakeFetch({
    "https://api.bilibili.com/": () =>
      response({ code: 0, data: { title: "av" } }),
    "https://www.youtube.com/oembed": () =>
      response({ title: "Rick", author_name: "RA" }),
  });
  const source = new VideoDetailsSource({ fetch });
  assert.deepEqual(await source.get("bilibili", "av170001"), { title: "av" });
  assert.deepEqual(await source.get("youtube", "dQw4w9WgXcQ"), {
    title: "Rick",
    author: "RA",
  });
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://api.bilibili.com/x/web-interface/view?aid=170001",
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    ],
  );
});

test("a bad cover keeps the title; any other failure gives no details", async () => {
  for (const cover of [
    () => response(JPEG, { type: "text/html" }),
    () =>
      response(new TextEncoder().encode("<svg/>"), { type: "image/svg+xml" }),
    () => response(JPEG, { type: "image/jpeg", length: 10_000_000 }),
    () =>
      response(new Uint8Array(600 * 1024).fill(0xff), {
        type: "image/jpeg",
        length: 0,
      }),
    () => response({}, { status: 404 }),
  ]) {
    const { fetch } = fakeFetch({
      "https://api.bilibili.com/": () => response(VIEW),
      "https://i0.hdslb.com/": cover,
    });
    const details = await new VideoDetailsSource({ fetch }).get(
      "bilibili",
      "BV1DRHU6LELy",
    );
    assert.equal(details.cover, undefined);
    assert.equal(details.author, "英雄联盟");
  }
  for (const api of [
    () => response("<!DOCTYPE html>", { status: 412, type: "text/html" }),
    () => response({ code: -404, message: "啥都木有" }),
    () => Promise.reject(new TypeError("fetch failed: offline")),
  ]) {
    const { fetch } = fakeFetch({ "https://api.bilibili.com/": api });
    assert.deepEqual(
      await new VideoDetailsSource({ fetch }).get("bilibili", "BV1DRHU6LELy"),
      {},
    );
  }
});

test("lookups time out instead of waiting on a silent server", async () => {
  const fetch: Fetch = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason)),
    );
  const started = Date.now();
  assert.deepEqual(
    await new VideoDetailsSource({ fetch, timeoutMs: 30 }).get(
      "youtube",
      "dQw4w9WgXcQ",
    ),
    {},
  );
  assert.ok(Date.now() - started < 2000);
});

test("answers are cached; failures are retried only after a while", async () => {
  let clock = 0;
  let online = false;
  const { fetch, calls } = fakeFetch({
    "https://www.youtube.com/oembed": () =>
      online
        ? response({ title: "Rick" })
        : Promise.reject(new TypeError("offline")),
  });
  const source = new VideoDetailsSource({
    fetch,
    now: () => clock,
    retryAfterMs: 1000,
  });
  assert.deepEqual(await source.get("youtube", "dQw4w9WgXcQ"), {});
  online = true;
  assert.deepEqual(await source.get("youtube", "dQw4w9WgXcQ"), {});
  assert.equal(calls.length, 1);
  clock = 1001;
  assert.deepEqual(await source.get("youtube", "dQw4w9WgXcQ"), {
    title: "Rick",
  });
  clock = 10_000_000;
  assert.deepEqual(await source.get("youtube", "dQw4w9WgXcQ"), {
    title: "Rick",
  });
  assert.equal(calls.length, 2);
});

test("invalid IDs never reach the network, and at most four lookups run at once", async () => {
  let running = 0;
  let peak = 0;
  const fetch: Fetch = async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return response({ title: "x" });
  };
  const source = new VideoDetailsSource({ fetch, maxEntries: 3 });
  assert.deepEqual(await source.get("youtube", "../../evil?"), {});
  assert.deepEqual(await source.get("bilibili", "BV1/../x"), {});
  assert.equal(peak, 0);
  const ids = Array.from({ length: 10 }, (_, i) => `dQw4w9WgXc${i}`);
  await Promise.all(ids.map((id) => source.get("youtube", id)));
  assert.equal(peak, 4);
});

test("parseHuggingFaceModel prefers pipeline · id and author", () => {
  assert.deepEqual(
    parseHuggingFaceModel({
      id: "google/gemma-2-2b",
      modelId: "google/gemma-2-2b",
      pipeline_tag: "text-generation",
      author: "google",
    }),
    {
      title: "text-generation · google/gemma-2-2b",
      author: "google",
    },
  );
  assert.deepEqual(
    parseHuggingFaceModel({
      id: "owner/model",
      modelId: "owner/model",
    }),
    {
      title: "owner/model",
      author: "owner",
    },
  );
});

test("a Hugging Face lookup fetches the models API", async () => {
  const { fetch, calls } = fakeFetch({
    "https://huggingface.co/api/models/google/gemma-2-2b": () =>
      response({
        id: "google/gemma-2-2b",
        modelId: "google/gemma-2-2b",
        pipeline_tag: "text-generation",
        author: "google",
      }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "huggingface",
    "google/gemma-2-2b",
  );
  assert.deepEqual(details, {
    title: "text-generation · google/gemma-2-2b",
    author: "google",
  });
  assert.equal(
    calls[0]?.url,
    "https://huggingface.co/api/models/google/gemma-2-2b",
  );
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

test("oEmbedThumbnail accepts YouTube img hosts only", () => {
  assert.equal(
    oEmbedThumbnail({
      thumbnail_url: "https://i.ytimg.com/vi/lp-EO5I60KA/hqdefault.jpg",
    }),
    "https://i.ytimg.com/vi/lp-EO5I60KA/hqdefault.jpg",
  );
  assert.equal(
    oEmbedThumbnail({ thumbnail_url: "https://evil.test/x.jpg" }),
    undefined,
  );
});

test("spotifyThumbnail accepts Spotify CDN hosts only", () => {
  assert.equal(
    spotifyThumbnail({
      thumbnail_url:
        "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e027359994525d219f64872d3b1",
    }),
    "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e027359994525d219f64872d3b1",
  );
  assert.equal(
    spotifyThumbnail({ thumbnail_url: "https://evil.test/x.jpg" }),
    undefined,
  );
});

test("a Spotify lookup uses oEmbed and may fetch a CDN cover", async () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const { fetch, calls } = fakeFetch({
    "https://open.spotify.com/oembed": () =>
      response({
        title: "Cut To The Feeling",
        thumbnail_url:
          "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e027359994525d219f64872d3b1",
      }),
    "https://image-cdn-ak.spotifycdn.com/": () =>
      response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "spotify",
    "track:11dFghVXANMlKmJXsNCbNl",
  );
  assert.equal(details.title, "Cut To The Feeling");
  assert.match(details.cover ?? "", /^data:image\/jpeg;base64,/);
  assert.equal(
    calls[0]!.url,
    "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F11dFghVXANMlKmJXsNCbNl",
  );
});

test("soundcloudThumbnail accepts sndcdn hosts only", () => {
  assert.equal(
    soundcloudThumbnail({
      thumbnail_url:
        "https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg",
    }),
    "https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg",
  );
  assert.equal(
    soundcloudThumbnail({ thumbnail_url: "https://evil.test/x.jpg" }),
    undefined,
  );
});

test("a SoundCloud lookup uses oEmbed and may fetch a sndcdn cover", async () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const { fetch, calls } = fakeFetch({
    "https://soundcloud.com/oembed": () =>
      response({
        title: "Flickermood by Forss",
        author_name: "Forss",
        thumbnail_url:
          "https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg",
      }),
    "https://i1.sndcdn.com/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "soundcloud",
    "forss/flickermood",
  );
  assert.equal(details.title, "Flickermood by Forss");
  assert.equal(details.author, "Forss");
  assert.match(details.cover ?? "", /^data:image\/jpeg;base64,/);
  assert.ok(
    calls[0]!.url.startsWith("https://soundcloud.com/oembed?format=json&url="),
  );
});

test("vimeoThumbnail accepts vimeocdn hosts only", () => {
  const thumb = "https://i.vimeocdn.com/video/145027281-abc_295x166?region=us";
  assert.equal(vimeoThumbnail({ thumbnail_url: thumb }), thumb);
  assert.equal(
    vimeoThumbnail({ thumbnail_url: "https://evil.test/video/1.jpg" }),
    undefined,
  );
  assert.equal(vimeoThumbnail({ title: "x" }), undefined);
});

test("a Vimeo lookup fetches oEmbed and a CDN thumbnail", async () => {
  const page = "https://vimeo.com/22439234";
  const thumb = "https://i.vimeocdn.com/video/145027281-abc_295x166?region=us";
  const { fetch, calls } = fakeFetch({
    "https://vimeo.com/api/oembed.json": () =>
      response({
        title: "The Mountain",
        author_name: "TSO Photography",
        duration: 185,
        thumbnail_url: thumb,
      }),
    "https://i.vimeocdn.com/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "vimeo",
    "22439234",
  );
  assert.equal(details.title, "The Mountain");
  assert.equal(details.author, "TSO Photography");
  assert.equal(details.duration, 185);
  assert.equal(
    details.cover,
    `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
  );
  assert.equal(
    calls[0]?.url,
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`,
  );
  assert.equal(calls[1]?.url, thumb);
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

test("npmRegistryPath keeps @ and encodes the slash for scoped names", () => {
  assert.equal(npmRegistryPath("lodash"), "lodash");
  assert.equal(npmRegistryPath("@babel/core"), "@babel%2Fcore");
});

test("parseNpmPackage prefers description and a named author", () => {
  assert.deepEqual(
    parseNpmPackage({
      name: "lodash",
      description: "Lodash modular utilities.",
      author: { name: "John-David Dalton", email: "john.doe@example.com" },
    }),
    {
      title: "Lodash modular utilities.",
      author: "John-David Dalton",
    },
  );
  assert.deepEqual(
    parseNpmPackage({
      name: "@babel/core",
      description: "Babel compiler core.",
      maintainers: [{ name: "babel-bot", email: "bot@example.com" }],
    }),
    {
      title: "Babel compiler core.",
      author: "babel-bot",
    },
  );
  assert.deepEqual(
    parseNpmPackage({
      name: "left-pad",
      author: "someone@example.com",
    }),
    { title: "left-pad" },
  );
});

test("an npm lookup fetches the registry document", async () => {
  const { fetch, calls } = fakeFetch({
    "https://registry.npmjs.org/lodash": () =>
      response({
        name: "lodash",
        description: "Lodash modular utilities.",
        author: { name: "John-David Dalton" },
      }),
    "https://registry.npmjs.org/@babel%2Fcore": () =>
      response({
        name: "@babel/core",
        description: "Babel compiler core.",
        maintainers: [{ name: "babel-bot" }],
      }),
  });
  const source = new VideoDetailsSource({ fetch });
  assert.deepEqual(await source.get("npm", "lodash"), {
    title: "Lodash modular utilities.",
    author: "John-David Dalton",
  });
  assert.deepEqual(await source.get("npm", "@babel/core"), {
    title: "Babel compiler core.",
    author: "babel-bot",
  });
  assert.equal(calls[0]?.url, "https://registry.npmjs.org/lodash");
  assert.equal(calls[1]?.url, "https://registry.npmjs.org/@babel%2Fcore");
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});

const SEASON = {
  code: 0,
  message: "success",
  result: {
    title: "现实主义勇者的王国再建记",
    season_title: "现实主义勇者的王国再建记",
    cover:
      "http://i0.hdslb.com/bfs/bangumi/image/ddfeb0782515b3af39fb12818273b9ced5850f34.jpg",
    square_cover: "http://i0.hdslb.com/bfs/bangumi/image/square.jpg",
    up_info: { uname: "哔哩哔哩番剧" },
    episodes: [
      {
        id: 409505,
        title: "1",
        long_title: "欢迎来到现实世界",
        duration: 1421000,
        cover: "http://i0.hdslb.com/bfs/archive/aaaa.jpg",
      },
      {
        id: 409506,
        title: "2",
        long_title: "唯才是举",
        duration: 1441000,
        cover:
          "http://i0.hdslb.com/bfs/archive/78fbc05a9552e8032496801cba031a19b5f0478a.png",
      },
    ],
  },
};

test("Bilibili season responses give episode or season titles and covers", () => {
  assert.deepEqual(parseBilibiliSeason(SEASON, "ep409506"), {
    details: {
      title: "现实主义勇者的王国再建记 · 唯才是举",
      author: "哔哩哔哩番剧",
      duration: 1441,
    },
    cover:
      "https://i0.hdslb.com/bfs/archive/78fbc05a9552e8032496801cba031a19b5f0478a.png",
  });
  assert.deepEqual(parseBilibiliSeason(SEASON, "ss40154"), {
    details: {
      title: "现实主义勇者的王国再建记",
      author: "哔哩哔哩番剧",
    },
    cover:
      "https://i0.hdslb.com/bfs/bangumi/image/ddfeb0782515b3af39fb12818273b9ced5850f34.jpg",
  });
  assert.throws(() => parseBilibiliSeason({ code: -404 }, "ep1"));
  assert.throws(() => parseBilibiliSeason(null, "ep1"));
});

test("a bangumi lookup uses the season API with ep_id or season_id", async () => {
  const { fetch, calls } = fakeFetch({
    "https://api.bilibili.com/pgc/view/web/season?ep_id=409506": () =>
      response(SEASON),
    "https://api.bilibili.com/pgc/view/web/season?season_id=40154": () =>
      response(SEASON),
    "https://i0.hdslb.com/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const source = new VideoDetailsSource({ fetch });
  const ep = await source.get("bilibili", "ep409506", "bangumi");
  assert.equal(ep.title, "现实主义勇者的王国再建记 · 唯才是举");
  assert.equal(ep.author, "哔哩哔哩番剧");
  assert.equal(ep.duration, 1441);
  assert.match(ep.cover ?? "", /^data:image\/jpeg;base64,/);
  const ss = await source.get("bilibili", "ss40154", "bangumi");
  assert.equal(ss.title, "现实主义勇者的王国再建记");
  assert.deepEqual(
    calls.map((call) => call.url).filter((u) => u.includes("pgc")),
    [
      "https://api.bilibili.com/pgc/view/web/season?ep_id=409506",
      "https://api.bilibili.com/pgc/view/web/season?season_id=40154",
    ],
  );
  assert.deepEqual(await source.get("bilibili", "ep409506"), {});
});

test("a YouTube channel lookup skips the network", async () => {
  let hits = 0;
  const fetch: Fetch = async () => {
    hits++;
    return response({ title: "nope" });
  };
  const details = await new VideoDetailsSource({ fetch }).get(
    "youtube",
    "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "channel",
  );
  assert.deepEqual(details, {});
  assert.equal(hits, 0);
});

test("custom /c/ and /user/ channel ids skip the network", async () => {
  let hits = 0;
  const fetch: Fetch = async () => {
    hits++;
    return response({ title: "nope" });
  };
  const source = new VideoDetailsSource({ fetch });
  assert.deepEqual(
    await source.get("youtube", "c:GoogleDevelopers", "channel"),
    {},
  );
  assert.deepEqual(
    await source.get("youtube", "user:GoogleDevelopers", "channel"),
    {},
  );
  assert.equal(hits, 0);
});
