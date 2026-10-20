import assert from "node:assert/strict";
import test from "node:test";
import { embedEstimatedHeight } from "./estimated-height";
import { writtenHeight, writtenWidth } from "./image-size";

test("WxH size reserves the written height, not one line", () => {
  assert.equal(writtenWidth("![[pic.png|200x800]]"), 200);
  assert.equal(writtenHeight("![[pic.png|200x800]]"), 800);
  assert.equal(writtenHeight("![alt|200x800](a.png)"), 800);
  assert.equal(writtenHeight("![200](a.png)"), undefined);
  const height = embedEstimatedHeight("![[pic.png|200x800]]");
  // Default WidgetType estimatedHeight (-1) → ~24px. Explicit 800px tall.
  assert.ok(height > 700, `got ${height}`);
  assert.ok(height < 900, `got ${height}`);
});

test("width-only and unsized images still beat the one-line default", () => {
  const sized = embedEstimatedHeight("![[pic.png|100]]");
  const plain = embedEstimatedHeight("![[pic.png]]");
  const markdown = embedEstimatedHeight("![alt](https://ex.com/a.png)");
  const data = embedEstimatedHeight(
    "![tall](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)",
  );
  for (const height of [sized, plain, markdown, data]) {
    assert.ok(height > 200, `got ${height}`);
  }
});

test("note embeds, media and PDF cards use kind defaults above one line", () => {
  assert.ok(embedEstimatedHeight("![[Note]]") > 100);
  assert.ok(embedEstimatedHeight("![[clip.mp4]]") > 150);
  assert.ok(embedEstimatedHeight("![[doc.pdf]]") > 40);
  assert.ok(embedEstimatedHeight("![[doc.pdf]]") < 120);
});

test("inline WxH images use the same height reserve as block embeds", () => {
  // Mid-paragraph `text ![[pic|200x800]] more` still needs |WxH|, not one line.
  const height = embedEstimatedHeight("![[pic.png|200x800]]");
  assert.ok(height > 700, `got ${height}`);
});

test("YouTube and Bilibili image links reserve video-card height, not PDF card", () => {
  // Online Videos post-processes these into `.mw-video` cards (~16:9 thumb).
  // Without a dedicated reserve they fell through to CARD_DEFAULT (~64px).
  const youtube = embedEstimatedHeight(
    "![Never](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
  );
  const short = embedEstimatedHeight("![](https://youtu.be/dQw4w9WgXcQ)");
  const bilibili = embedEstimatedHeight(
    "![](https://www.bilibili.com/video/BV1DRHU6LELy)",
  );
  const pdf = embedEstimatedHeight("![[doc.pdf]]");
  for (const height of [youtube, short, bilibili]) {
    assert.ok(height > 150, `got ${height}`);
    assert.ok(height > pdf * 2, `video=${height} pdf=${pdf}`);
  }
});
