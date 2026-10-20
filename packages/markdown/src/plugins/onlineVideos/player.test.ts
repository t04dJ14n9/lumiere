import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoUrl } from "./parse";
import {
  PLAYER_SANDBOX,
  isPlayerUrl,
  playerAttributes,
  playerUrl,
  providers,
  thumbnailUrl,
} from "./player";

const video = (link: string) => {
  const parsed = parseVideoUrl(link);
  assert.ok(parsed, link);
  return parsed;
};

test("players come from the provider's embed origin with the parsed ID", () => {
  assert.equal(
    playerUrl(video("https://youtu.be/dQw4w9WgXcQ?t=42")),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42",
  );
  assert.equal(
    playerUrl(video("https://www.bilibili.com/video/BV1DRHU6LELy?p=2")),
    "https://player.bilibili.com/player.html?bvid=BV1DRHU6LELy&p=2&autoplay=0",
  );
  assert.equal(
    playerUrl(video("https://www.bilibili.com/video/av170001")),
    "https://player.bilibili.com/player.html?aid=170001&p=1&autoplay=0",
  );
});

test("player frames are sandboxed, lazy and send only the origin as referrer", () => {
  const attributes = playerAttributes(
    video("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
  );
  assert.equal(attributes.sandbox, PLAYER_SANDBOX);
  assert.doesNotMatch(PLAYER_SANDBOX, /allow-(top-navigation|popups|forms)/);
  assert.equal(attributes.loading, "lazy");
  assert.equal(attributes.referrerpolicy, "strict-origin-when-cross-origin");
  assert.equal(attributes.title, "YouTube video dQw4w9WgXcQ");
  assert.ok(isPlayerUrl(attributes.src!));
});

test("the allowlist accepts only the two player shapes", () => {
  assert.equal(
    isPlayerUrl("https://player.bilibili.com/player.html?bvid=BV1DRHU6LELy"),
    true,
  );
  for (const href of [
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ/../../evil",
    "https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ",
    "https://player.bilibili.com/other.html",
    "https://player.bilibili.com.evil.test/player.html",
    "https://user@player.bilibili.com/player.html",
    "not a url",
  ]) {
    assert.equal(isPlayerUrl(href), false, href);
  }
});

test("only YouTube has a predictable thumbnail; only Bilibili may embed", () => {
  assert.equal(
    thumbnailUrl(video("https://youtu.be/dQw4w9WgXcQ")),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  assert.equal(
    thumbnailUrl(video("https://www.bilibili.com/video/BV1DRHU6LELy")),
    undefined,
  );
  assert.equal(providers.youtube.embeddable, false);
  assert.equal(providers.bilibili.embeddable, true);
});

test("Hugging Face refuses an in-webview player", () => {
  assert.equal(providers.huggingface.embeddable, false);
  assert.equal(
    thumbnailUrl(video("https://huggingface.co/google/gemma-2-2b")),
    undefined,
  );
  assert.throws(() =>
    playerUrl(video("https://huggingface.co/google/gemma-2-2b")),
  );
});

test("Spotify refuses an in-webview player", () => {
  assert.throws(() =>
    playerUrl(video("https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl")),
  );
  assert.equal(providers.spotify.embeddable, false);
});

test("SoundCloud refuses an in-webview player", () => {
  assert.throws(() =>
    playerUrl(video("https://soundcloud.com/forss/flickermood")),
  );
  assert.equal(providers.soundcloud.embeddable, false);
});

test("npm refuses an in-webview player", () => {
  assert.equal(providers.npm.embeddable, false);
  assert.equal(
    thumbnailUrl(video("https://www.npmjs.com/package/lodash")),
    undefined,
  );
  assert.throws(() => playerUrl(video("https://www.npmjs.com/package/lodash")));
});

test("bangumi and playlists refuse an in-webview player", () => {
  assert.throws(() =>
    playerUrl(video("https://www.bilibili.com/bangumi/play/ep409506")),
  );
  assert.equal(
    thumbnailUrl(video("https://www.bilibili.com/bangumi/play/ep409506")),
    undefined,
  );
  assert.throws(() =>
    playerUrl(
      video(
        "https://www.youtube.com/playlist?list=PL4cUxeGkcC9gZD-Tvwfod2gaISzfRiP9d",
      ),
    ),
  );
});

test("Docker Hub refuses an in-webview player", () => {
  assert.equal(providers.dockerhub.embeddable, false);
  assert.equal(
    thumbnailUrl(video("https://hub.docker.com/_/nginx")),
    undefined,
  );
  assert.throws(() => playerUrl(video("https://hub.docker.com/_/nginx")));
});
