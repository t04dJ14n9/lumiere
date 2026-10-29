import { expect, test } from "@playwright/test";
import { open } from "./harness";

const TEXT = `| alpha | beta  |
| ----- | ----- |
| gamma | delta |
`;

test("cell : dialog mounts on the outer bar and Esc restores --NORMAL--", async ({
  page,
}) => {
  await open(page, TEXT, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.locator(".hybrid-table .table-cell-content").first().click();
  await page.keyboard.press("Escape");
  await page.keyboard.type(":w");
  const panel = page.locator(".cm-vim-panel").first();
  const prompt = page.locator(".cm-vim-panel input");
  await expect(prompt).toHaveCount(1);
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue("w");
  // Cell editor must stay alive while the shared status dialog is focused.
  await expect(page.locator(".table-cell-content .cm-editor")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(panel).toContainText("--NORMAL--");
  expect(await page.evaluate(() => window.harness.text)).toBe(TEXT);
});

test("prose : Esc still restores --NORMAL--", async ({ page }) => {
  await open(page, "hello prose\n\n" + TEXT, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.getByRole("textbox", { name: "Markdown content" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.type(":");
  const prompt = page.locator(".cm-vim-panel input");
  await expect(prompt).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(page.locator(".cm-vim-panel").first()).toContainText(
    "--NORMAL--",
  );
});
