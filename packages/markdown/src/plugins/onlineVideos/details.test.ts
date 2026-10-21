import test from "node:test";
import assert from "node:assert/strict";
import type { Fetch, FetchResponse } from "./details";
import {
  USER_AGENT,
  VideoDetailsSource,
  anilistCoverUrl,
  coverUrl,
  imageDataUrl,
  parseAnilistMedia,
  parseBilibiliView,
  parseHuggingFaceModel,
  parseOEmbed,
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
  const calls: {
    url: string;
    headers: Record<string, string>;
    method?: string;
  }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      ...(init.method !== undefined ? { method: init.method } : {}),
    });
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

test("anilistCoverUrl accepts s4.anilist.co anilistcdn paths only", () => {
  assert.equal(
    anilistCoverUrl(
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png",
    ),
    "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png",
  );
  for (const value of [
    "https://evil.test/file/anilistcdn/media/anime/cover/large/bx1.png",
    "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.png?x=1",
    "https://s4.anilist.co/other/bx1.png",
    "http://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.png",
  ]) {
    assert.equal(anilistCoverUrl(value), undefined);
  }
});

test("parseAnilistMedia prefers English title and main studio", () => {
  assert.deepEqual(
    parseAnilistMedia({
      data: {
        Media: {
          type: "ANIME",
          title: {
            english: "Cowboy Bebop",
            romaji: "Cowboy Bebop",
            native: "カウボーイビバップ",
          },
          coverImage: {
            extraLarge:
              "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png",
            large:
              "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1-GCsPm7waJ4kS.png",
          },
          studios: { nodes: [{ name: "Sunrise" }] },
          staff: {
            edges: [
              {
                role: "Director",
                node: { name: { full: "Shinichirou Watanabe" } },
              },
            ],
          },
        },
      },
    }),
    {
      details: { title: "Cowboy Bebop", author: "Sunrise" },
      cover:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png",
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

test("parseAnilistMedia uses Story & Art staff when studios are empty", () => {
  assert.deepEqual(
    parseAnilistMedia({
      data: {
        Media: {
          type: "MANGA",
          title: { romaji: "Berserk" },
          coverImage: {
            large:
              "https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx30002-Cul4OeN7bYtn.jpg",
          },
          studios: { nodes: [] },
          staff: {
            edges: [
              {
                role: "Story & Art (vols 1-41)",
                node: { name: { full: "Kentarou Miura" } },
              },
            ],
          },
        },
      },
    }),
    {
      details: { title: "Berserk", author: "Kentarou Miura" },
      cover:
        "https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx30002-Cul4OeN7bYtn.jpg",
    },
  );
});

test("an AniList lookup POSTs GraphQL and may fetch the cover", async () => {
  const cover =
    "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png";
  const { fetch, calls } = fakeFetch({
    "https://graphql.anilist.co": () =>
      response({
        data: {
          Media: {
            type: "ANIME",
            title: { english: "Cowboy Bebop", romaji: "Cowboy Bebop" },
            coverImage: { extraLarge: cover },
            studios: { nodes: [{ name: "Sunrise" }] },
            staff: { edges: [] },
          },
        },
      }),
    "https://s4.anilist.co/": () => response(JPEG, { type: "image/jpeg" }),
  });
  const details = await new VideoDetailsSource({ fetch }).get(
    "anilist",
    "anime:1",
  );
  assert.equal(details.title, "Cowboy Bebop");
  assert.equal(details.author, "Sunrise");
  assert.equal(
    details.cover,
    `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
  );
  assert.equal(calls[0]?.url, "https://graphql.anilist.co");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[1]?.url, cover);
  assert.ok(calls.every((call) => call.headers["User-Agent"] === USER_AGENT));
});
