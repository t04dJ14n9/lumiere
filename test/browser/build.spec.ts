import { test, expect } from "@playwright/test";
import { servePage } from "./page-server";
test("the production webview entry loads in Chromium", async ({ page }) => {
  await servePage(page, '<main id="editor"></main>');
  await page.evaluate(() => {
    Object.assign(window, {
      acquireVsCodeApi: () => ({
        postMessage() {},
        getState() {
          return undefined;
        },
        setState() {},
      }),
    });
  });
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.addScriptTag({
    type: "module",
    url: "http://editor.test/dist/webview/editor.js",
  });
  await expect(page.locator("#editor")).toBeVisible({ visible: false });
  expect(errors).toEqual([]);
});
