import type { Frame, Page } from "@playwright/test";
import {
  PAGE_STATUS,
  command,
  expect as baseExpect,
  openFile,
  pdfViewer,
  statusBarEntry,
  test,
} from "./workbench";

// Zen resizes the whole window, which takes a while on a busy runner.
const expect = baseExpect.configure({ timeout: 30_000 });

// PDF zen mode: core Zen Mode plus the viewer's floating bar with Exit zen.
// Whether the window goes full screen is VS Code's business (and needs a window
// manager); what is tested is what the extension adds.

const PDF = "docs/outline.pdf";
const modifier = process.platform === "darwin" ? "Control+Meta" : "Control+Alt";

const floating = (viewer: Frame) => viewer.getByRole("toolbar", { name: "PDF toolbar" });
const exitButton = (viewer: Frame) => floating(viewer).getByRole("button", { name: "Exit zen mode" });

/** Give the viewer the keyboard focus, so shortcuts reach it as a reader's would. */
async function focusViewer(viewer: Frame): Promise<void> {
  await viewer.locator(".viewport").focus();
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
}

async function leaveZen(page: Page): Promise<void> {
  // Core's own chord toggles zen: only when it is still on.
  if (await page.locator(".part.statusbar").isVisible()) return;
  await page.keyboard.press("Control+k");
  await page.keyboard.press("z");
}

test("Enter and Exit Zen Mode from the palette: the status bar goes, the floating bar with Exit zen comes, and both go back", async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.locator(".page img").first()).toBeVisible();
  try {
    await expect(statusBarEntry(page, PAGE_STATUS)).toBeVisible();
    await expect(floating(viewer)).toHaveCount(0);
    await command(page, "PDF: Enter Zen Mode");
    // Core zen hides the status bar; the viewer's controls are in the viewer now.
    await expect(page.locator(".part.statusbar")).toBeHidden();
    await expect(floating(viewer)).toBeVisible();
    await expect(exitButton(viewer)).toBeVisible();
    await page.screenshot({ path: "test-results/zen-on.png" });
    // The floating bar is the controls: the page field works.
    const field = floating(viewer).getByRole("textbox", { name: "Page" });
    // Entering zen resizes the window and the pages are laid out again, which
    // can take a jump to a page with it: go to the page until it stays.
    await expect
      .poll(async () => {
        await field.fill("3");
        await field.press("Enter");
        await page.waitForTimeout(400);
        return viewer.evaluate(() => document.querySelector<HTMLInputElement>('[aria-label="Page"]')?.value);
      }, { timeout: 30_000, intervals: [200] })
      .toBe("3");
    // Exit zen from the bar.
    await exitButton(viewer).click();
    await expect(page.locator(".part.statusbar")).toBeVisible();
    await expect(floating(viewer)).toHaveCount(0);
  } finally {
    await leaveZen(page);
  }
});

test("Ctrl+Alt+Z (Ctrl+Cmd+Z on macOS) enters zen from the PDF and leaves it; so does Escape Escape", async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.locator(".page img").first()).toBeVisible();
  await expect(statusBarEntry(page, PAGE_STATUS)).toBeVisible();
  try {
    await focusViewer(viewer);
    await page.keyboard.press(`${modifier}+z`);
    await expect(exitButton(viewer)).toBeVisible();
    await expect(page.locator(".part.statusbar")).toBeHidden();
    await focusViewer(viewer);
    await page.keyboard.press(`${modifier}+z`);
    await expect(exitButton(viewer)).toHaveCount(0);
    await expect(page.locator(".part.statusbar")).toBeVisible();

    await focusViewer(viewer);
    await page.keyboard.press(`${modifier}+z`);
    await expect(exitButton(viewer)).toBeVisible();
    await focusViewer(viewer);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(exitButton(viewer)).toHaveCount(0);
    await expect(page.locator(".part.statusbar")).toBeVisible();
  } finally {
    await leaveZen(page);
  }
});
