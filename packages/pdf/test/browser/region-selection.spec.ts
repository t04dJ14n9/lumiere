import { expect, test } from "@playwright/test";
import {
  open,
  messages,
  lastSelection,
  pagePoint,
  selectText,
  drag,
  TEXT_MIDLINE,
} from "./viewer-support";

test("a drag over empty space selects that region; Escape clears it", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await drag(page, at(150, 150), at(250, 250));
  await expect(page.locator(".region-selection")).toBeVisible();
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "region", page: 1 });
  const { rect } = (await lastSelection(page)) as { rect: number[] };
  const expected = [150, 150, 250, 250];
  rect.forEach((value, index) =>
    expect(
      Math.abs(value - expected[index]!),
      `region ${rect.join(",")}`,
    ).toBeLessThan(1),
  );

  await page.keyboard.press("Escape");
  await expect(page.locator(".region-selection")).toHaveCount(0);
  await expect.poll(() => lastSelection(page)).toBeNull();
});

test("a region is reported again with the text inside it and a PNG snapshot", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  // Around "Synthetic page 1", from empty space above and left of it.
  await drag(page, at(60, 70), at(230, 120));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "region", page: 1, text: "Synthetic page 1" });
  const image = (await messages(page))
    .filter((message) => message.type === "selection")
    .at(-1)?.image;
  expect(image).toMatch(/^data:image\/png;base64,/);
  // Twice the region's 170 x 50 points.
  const size = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, image as string);
  expect(Math.abs(size[0]! - 340)).toBeLessThanOrEqual(2);
  expect(Math.abs(size[1]! - 100)).toBeLessThanOrEqual(2);

  // A figure has no text: no text field, but still a snapshot.
  await page.keyboard.press("Escape");
  await drag(page, at(150, 150), at(250, 250));
  await expect
    .poll(
      async () =>
        (await messages(page))
          .filter((message) => message.type === "selection")
          .at(-1)?.image,
    )
    .toMatch(/^data:image\/png/);
  expect(await lastSelection(page)).not.toHaveProperty("text");
});

test("a region drag released outside the viewer ends when the pointer comes back", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(150, 150));
  await page.mouse.down();
  await page.mouse.move(...at(250, 250), { steps: 8 });
  await expect(page.locator(".region-marquee")).toBeVisible();
  // In VS Code the viewer is an iframe: a release over the rest of the window never reaches it.
  await page.evaluate(() => {
    const swallow = (event: Event): void => event.stopImmediatePropagation();
    for (const type of ["pointerup", "mouseup"]) {
      window.addEventListener(type, swallow, { capture: true, once: true });
    }
  });
  await page.mouse.up();
  await expect(page.locator(".region-marquee")).toBeVisible();

  await page.mouse.move(...at(200, 300), { steps: 4 });
  await expect(page.locator(".region-marquee")).toHaveCount(0);
  await expect(page.locator(".region-selection")).toBeVisible();
  const { rect } = (await lastSelection(page)) as { rect: number[] };
  // The region ends where the viewer last saw the pointer.
  [150, 150, 250, 250].forEach((value, index) =>
    expect(Math.abs(rect[index]! - value)).toBeLessThan(2),
  );
});

test("a right-click keeps the selection, for the context menu, and later drags still work", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await drag(page, at(60, 70), at(230, 150));
  await expect(page.locator(".region-selection")).toBeVisible();
  // Over the text inside the region. In VS Code the context menu then takes the button release.
  await page.mouse.move(...at(100, TEXT_MIDLINE));
  await page.mouse.down({ button: "right" });
  await page.evaluate(() => {
    const swallow = (event: Event): void => event.stopImmediatePropagation();
    for (const type of ["pointerup", "mouseup"]) {
      window.addEventListener(type, swallow, { capture: true, once: true });
    }
  });
  await page.mouse.up({ button: "right" });
  await page.mouse.move(...at(150, 300), { steps: 4 });
  await expect(page.locator(".region-selection")).toBeVisible();
  expect(await lastSelection(page)).toMatchObject({ kind: "region" });

  await page.keyboard.press("Escape");
  await drag(page, at(150, 200), at(250, 300));
  await expect(page.locator(".region-selection")).toBeVisible();
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "region", page: 1 });
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "text", text: "Synthetic page 1" });
});

/** Theme colours VS Code passes to webviews, from VS Code 1.141 and Cursor 3.24. */
