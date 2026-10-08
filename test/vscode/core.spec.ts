import { test, expect, chromium } from "@playwright/test";
import type { Page, Frame } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
async function command(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+Shift+p");
  const input = page.locator(".quick-input-widget input");
  await input.fill(">" + title);
  const item = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: title })
    .first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(input).not.toBeVisible();
}
test("isolated installed editor types, saves and performs native document undo", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((page) => !page.url().startsWith("devtools:"))!;
    await expect(page.locator(".monaco-workbench")).toBeVisible();
    console.log("Native: closing all editors");
    await command(page, "View: Close All Editor Groups");
    console.log("Native: opening fixture");
    await page.keyboard.press("ControlOrMeta+p");
    await page.locator(".quick-input-widget input").fill(path.join(paths.workspace, "Note.md"));
    await page.keyboard.press("Enter");
    await expect(page.locator(".tabs-container .tab").filter({ hasText: "Note.md" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Shift+p");
    await page.locator(".quick-input-widget input").fill(">View: Reopen Editor With");
    await page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: "View: Reopen Editor With..." })
      .first()
      .click();

    await page
      .locator(".quick-input-widget")
      .locator(".monaco-list-row")
      .filter({ hasText: "Markdown Workbench" })
      .first()
      .click();
    console.log("Native: waiting for Markdown Workbench webview");
    let frame: Frame | undefined;
    await expect
      .poll(() => {
        frame = page
          .frames()
          .find((f) => f.url().includes("vscode-webview") && f.url().includes("index.html"));
        return Boolean(frame);
      })
      .toBe(true);
    // The custom editor can be nested inside VS Code's outer webview frame.
    await expect
      .poll(async () => {
        for (const f of page.frames())
          if (await f.getByRole("textbox", { name: "Markdown content" }).count()) {
            frame = f;
            return true;
          }
        return false;
      })
      .toBe(true);
    const editor = frame!.getByRole("textbox", { name: "Markdown content" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(" saved");
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(() => readFileSync(path.join(paths.workspace, "Note.md"), "utf8"))
      .toBe("# Native Markdown\n\nOriginal line saved");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(() => readFileSync(path.join(paths.workspace, "Note.md"), "utf8"))
      .toBe("# Native Markdown\n\nOriginal line");
  } finally {
    await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
});
