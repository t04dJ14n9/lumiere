import { expect, test } from "@playwright/test";
import { open, pageOffset } from "./viewer-support";

test("each reload stops the previous PDF's engine and its workers", async ({
  page,
}) => {
  await open(page);
  // The PDFium worker and its image encoder.
  await expect.poll(() => page.workers().length).toBeGreaterThan(0);
  const workers = page.workers().length;
  for (let reload = 1; reload <= 3; reload++) {
    await page.evaluate(async (reload) => {
      document
        .querySelector(".viewer")!
        .classList.add(`before-reload-${reload}`);
      const data = await (await fetch("/fixtures/outline.pdf")).arrayBuffer();
      (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
        type: "load",
        sha256: "test-sha",
        data,
      });
    }, reload);
    await expect(
      page.locator(
        `.viewer:not(.before-reload-${reload}) .page[data-page-index="0"] img`,
      ),
    ).toBeVisible();
  }
  // PdfRenderSession.dispose() destroyed each old engine, ending its workers.
  await expect.poll(() => page.workers().length).toBe(workers);
});

test("a reloaded file reopens at the same place and zoom", async ({ page }) => {
  await open(page);
  const field = page.getByRole("textbox", { name: "Page" });
  const zoom = page.getByRole("textbox", { name: "Zoom" });
  await zoom.fill("300");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("300");
  await field.fill("7");
  await field.press("Enter");
  await expect
    .poll(async () => Math.abs((await pageOffset(page, 7))!))
    .toBeLessThan(16);
  // Partway down page 7.
  await page
    .locator(".viewport")
    .evaluate((viewport) => viewport.scrollBy(0, 200));
  await expect(field).toHaveValue("7");
  // The viewer remembers the place from its scroll events; let them arrive
  // before the reload.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = (await pageOffset(page, 7))!;

  await page.evaluate(async () => {
    document.querySelector(".viewer")!.classList.add("before-reload");
    const data = await (await fetch("/fixtures/outline.pdf")).arrayBuffer();
    (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
      type: "load",
        sha256: "test-sha",
      data,
    });
  });
  await expect(
    page.locator('.viewer:not(.before-reload) .page[data-page-index="6"] img'),
  ).toBeVisible();
  await expect(zoom).toHaveValue("300");
  await expect(field).toHaveValue("7");
  await expect
    .poll(async () => Math.abs((await pageOffset(page, 7))! - before))
    .toBeLessThan(2);
});

test("zoom buttons and the zoom field change the zoom", async ({ page }) => {
  await open(page);
  const zoom = page.getByRole("textbox", { name: "Zoom" });
  const initial = Number(await zoom.inputValue());
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => Number(await zoom.inputValue()))
    .toBeGreaterThan(initial);
  await zoom.fill("50");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("50");
  const width = (await page
    .locator('.page[data-page-index="0"]')
    .boundingBox())!.width;
  expect(Math.round(width)).toBe(150);
});

test("each Ctrl+wheel notch zooms one step, and small trackpad movements zoom in proportion", async ({
  page,
}) => {
  await open(page);
  const zoom = page.getByRole("textbox", { name: "Zoom" });
  await zoom.fill("100");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("100");
  const box = (await page.locator(".viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const notch = async (deltaY: number, expected: string): Promise<void> => {
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, deltaY);
    await page.keyboard.up("Control");
    await expect(zoom).toHaveValue(expected);
  };
  await notch(-100, "110");
  await notch(-100, "125");
  await notch(100, "110");
  await notch(100, "100");
  await notch(100, "90");

  // Small deltas are a pinch: the zoom follows exp(total / 100), here 90% x e^0.4.
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -10);
  }
  await page.keyboard.up("Control");
  await expect
    .poll(async () => Number(await zoom.inputValue()), { timeout: 10_000 })
    .toBeGreaterThan(130);
  expect(Number(await zoom.inputValue())).toBeLessThan(138);
});
