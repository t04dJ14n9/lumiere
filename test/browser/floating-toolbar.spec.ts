import { expect, test } from "@playwright/test";
import { open, messages, lastSelection, lastView } from "./viewer-support";

test("the floating bar floats over the pages at its edge, and fades while the pointer rests", async ({
  page,
}) => {
  await open(page, "?toolbar=floating");
  const bar = page.getByRole("toolbar", { name: "PDF toolbar" });
  await expect(bar).toContainText("/ 12");
  await expect(bar).toHaveAttribute("aria-orientation", "horizontal");
  // The pages take the whole viewer; the bar is over them, centred at the bottom.
  const viewport = (await page.locator(".viewport").boundingBox())!;
  expect([viewport.y, viewport.height]).toEqual([
    0,
    page.viewportSize()!.height,
  ]);
  const box = (await bar.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(12);
  expect(viewport.height - (box.y + box.height)).toBeGreaterThan(0);
  expect(viewport.height - (box.y + box.height)).toBeLessThan(40);

  // Its buttons work as the slim bar's do.
  await bar.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => lastView(page)).toMatchObject({ page: 2 });

  // Resting, it fades out of the way, and is back once the pointer moves.
  await page.mouse.move(500, 300);
  await expect(bar).toHaveCSS("opacity", "0", { timeout: 5_000 });
  await page.mouse.move(520, 320);
  await expect(bar).toHaveCSS("opacity", "1");
  // Not while the pointer is over it.
  await bar.getByRole("button", { name: "Zoom in" }).hover();
  await page.waitForTimeout(2_500);
  await expect(bar).toHaveCSS("opacity", "1");
});

test("dragging the floating bar's grip docks it to the nearest edge, and tells the extension", async ({
  page,
}) => {
  await open(page, "?toolbar=floating");
  const bar = page.getByRole("toolbar", { name: "PDF toolbar" });
  const grip = bar.getByRole("button", { name: /^Move toolbar/u });
  const viewport = (await page.locator(".viewport").boundingBox())!;
  const docks = async () =>
    (await messages(page))
      .filter((message) => message.type === "floatingDock")
      .map((message) => message.dock);

  const dragGripTo = async (x: number, y: number): Promise<void> => {
    const from = (await grip.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 10 });
    // While dragging, the bar follows the pointer and the target edge shows.
    await expect(page.locator(".dock-target")).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".dock-target")).toHaveCount(0);
  };

  await dragGripTo(viewport.width - 30, viewport.height * 0.4);
  await expect(bar).toHaveAttribute("aria-orientation", "vertical");
  await expect.poll(docks).toEqual(["right"]);
  let box = (await bar.boundingBox())!;
  expect(viewport.width - (box.x + box.width)).toBeLessThan(40);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
    12,
  );
  // Upright, every control stays on screen.
  for (const button of await bar.getByRole("button").all()) {
    const { y, height } = (await button.boundingBox())!;
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y + height).toBeLessThanOrEqual(viewport.height);
  }
  await bar.getByRole("button", { name: "Fit page" }).click();
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "page" });

  await dragGripTo(viewport.width * 0.6, 20);
  await expect(bar).toHaveAttribute("aria-orientation", "horizontal");
  box = (await bar.boundingBox())!;
  expect(box.y).toBeLessThan(30);
  await dragGripTo(15, viewport.height * 0.7);
  box = (await bar.boundingBox())!;
  expect(box.x).toBeLessThan(30);
  await expect.poll(docks).toEqual(["right", "top", "left"]);

  // Dropped at its own edge, nothing changes; the arrow keys move it too.
  await grip.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(bar).toHaveAttribute("aria-orientation", "horizontal");
  await expect.poll(docks).toEqual(["right", "top", "left", "bottom"]);
  // A drag does not select anything on the pages under it.
  expect((await lastSelection(page)) ?? null).toBeNull();
});

test("the floating bar starts at the remembered edge and follows the extension", async ({
  page,
}) => {
  await open(page, "?toolbar=floating&dock=left");
  const bar = page.getByRole("toolbar", { name: "PDF toolbar" });
  await expect(bar).toHaveAttribute("aria-orientation", "vertical");
  expect((await bar.boundingBox())!.x).toBeLessThan(30);
  await page.evaluate(() =>
    (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
      type: "toolbar",
      toolbar: { mode: "floating", dock: "top" },
    }),
  );
  await expect(bar).toHaveAttribute("aria-orientation", "horizontal");
  expect((await bar.boundingBox())!.y).toBeLessThan(30);
  // A malformed edge is the default one, the bottom.
  await page.evaluate(() =>
    (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
      type: "toolbar",
      toolbar: { mode: "floating", dock: "middle" },
    }),
  );
  await expect
    .poll(async () => (await bar.boundingBox())!.y)
    .toBeGreaterThan(page.viewportSize()!.height - 80);
});
