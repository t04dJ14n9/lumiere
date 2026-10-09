import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const BILIBILI = "https://www.bilibili.com/video/BV1DRHU6LELy?p=2";
// A 1×1 PNG, so no test reaches the real providers.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function stubProviders(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(
    /^https:\/\/(i\.ytimg\.com|[^/]*youtube[^/]*|[^/]*bilibili\.com)\//,
    (route) => {
      const url = route.request().url();
      requests.push(url);
      return url.startsWith("https://i.ytimg.com/")
        ? route.fulfill({ contentType: "image/png", body: PIXEL })
        : route.fulfill({
            contentType: "text/html",
            body: "<p>player stub</p>",
          });
    },
  );
  return requests;
}

test("a YouTube link becomes a card that opens the video in the browser", async ({
  page,
}) => {
  const requests = await stubProviders(page);
  await open(
    page,
    `Intro\n\n![Never gonna](${YOUTUBE}&t=42)\n\nAfter`,
    "obsidian",
    {
      trusted: true,
    },
  );
  const card = page.locator(".cm-content .mw-video");
  await expect(card).toHaveAttribute("data-provider", "youtube");
  await expect(card.locator(".mw-video-title")).toHaveText("Never gonna");
  await expect(card.locator(".mw-video-meta")).toHaveText(
    "YouTube · dQw4w9WgXcQ",
  );
  await expect(card.locator(".mw-video-thumb img")).toHaveAttribute(
    "src",
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  // YouTube refuses embeds in webviews (error 153), so there is no player.
  await expect(card.locator(".mw-video-play")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  // Buttons, since VS Code's webview would also open a clicked <a href>.
  await expect(card.locator("a")).toHaveCount(0);
  await card.getByRole("button", { name: "Open on YouTube" }).click();
  await card
    .getByRole("button", { name: "Open Never gonna on YouTube" })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.harness.opened))
    .toEqual([`${YOUTUBE}&t=42s`, `${YOUTUBE}&t=42s`]);
  expect(requests.every((url) => url.startsWith("https://i.ytimg.com/"))).toBe(
    true,
  );
});

test("the caret on a video link reveals its Markdown, like an image", async ({
  page,
}) => {
  await stubProviders(page);
  const source = `Intro\n\n![](https://youtu.be/dQw4w9WgXcQ)\n\nAfter`;
  await open(page, source, "obsidian", { trusted: true });
  await expect(page.locator(".cm-content .mw-video")).toHaveCount(1);
  await page.evaluate((at) => window.harness.reveal(at), source.indexOf("!["));
  await expect(page.locator(".cm-content .mw-video")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText(
    "![](https://youtu.be/dQw4w9WgXcQ)",
  );
  await page.evaluate(() => window.harness.reveal(0));
  await expect(page.locator(".cm-content .mw-video")).toHaveCount(1);
});

test("Play here swaps a Bilibili card for a sandboxed player", async ({
  page,
}) => {
  const requests = await stubProviders(page);
  await open(page, `Intro\n\n![](${BILIBILI})`, "obsidian", { trusted: true });
  const card = page.locator(".cm-content .mw-video");
  await expect(card.locator(".mw-video-title")).toHaveText("Bilibili video");
  await expect(card.locator(".mw-video-thumb")).toHaveCount(0);
  expect(requests).toEqual([]);
  await card.getByRole("button", { name: "Play here" }).click();
  const frame = card.locator(".mw-video-frame iframe");
  await expect(frame).toHaveAttribute(
    "src",
    "https://player.bilibili.com/player.html?bvid=BV1DRHU6LELy&p=2&autoplay=0",
  );
  await expect(frame).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-presentation",
  );
  await expect(frame).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );
  await expect(
    page.frameLocator(".mw-video-frame iframe").getByText("player stub"),
  ).toBeVisible();
  // The card hugs the player and its caption.
  const [cardBox, frameBox, bodyBox] = await Promise.all([
    card.boundingBox(),
    frame.boundingBox(),
    card.locator(".mw-video-body").boundingBox(),
  ]);
  expect(frameBox!.height).toBeCloseTo((frameBox!.width * 9) / 16, 0);
  expect(cardBox!.height).toBeLessThanOrEqual(
    frameBox!.height + bodyBox!.height + 4,
  );
  expect(bodyBox!.height).toBeLessThan(120);
  // The browser link stays in case the player cannot play here.
  await expect(card.getByText("Open on Bilibili")).toBeVisible();
  await expect(card.getByRole("button", { name: "Play here" })).toHaveCount(0);
});

test("an untrusted workspace shows a card with no player or remote image", async ({
  page,
}) => {
  const requests = await stubProviders(page);
  await open(
    page,
    `Intro\n\n![Talk](${YOUTUBE})\n\n![](${BILIBILI})\n\n![](https://example.com/photo.png)`,
  );
  const cards = page.locator(".cm-content .mw-video");
  await expect(cards).toHaveCount(2);
  await expect(cards.locator("img")).toHaveCount(0);
  await expect(cards.locator(".mw-video-play")).toHaveCount(0);
  await expect(cards.first().locator(".mw-video-note")).toContainText(
    "untrusted workspace",
  );
  await cards.nth(1).getByRole("button", { name: "Open on Bilibili" }).click();
  await expect
    .poll(() => page.evaluate(() => window.harness.opened))
    .toEqual(["https://www.bilibili.com/video/BV1DRHU6LELy/?p=2"]);
  // Other remote images still go through embeds.
  await expect(page.locator(".cm-content img.note-image")).toHaveCount(1);
  expect(requests).toEqual([]);
});
