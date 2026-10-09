import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

/** Line 1's offset in the content, and what sits above it. */
async function firstLine(page: Page) {
  return page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const line = content.querySelector<HTMLElement>(":scope > .cm-line")!;
    return {
      text: line.textContent,
      top: line.offsetTop,
      padding: parseFloat(getComputedStyle(content).paddingTop),
      first: content.firstElementChild === line,
    };
  });
}

test("by default no inline title is shown and line 1 starts at the top", async ({
  page,
}) => {
  await open(page, "First line\n\nSecond");
  await expect(page.locator(".file-title")).toHaveCount(0);
  const line = await firstLine(page);
  expect(line.text).toBe("First line");
  expect(line.first).toBe(true);
  expect(line.top).toBe(line.padding);
});

test("turning the inline title on shows the file name above line 1", async ({
  page,
}) => {
  await open(page, "First line\n\nSecond", "obsidian", {
    features: { inlineTitle: { enabled: true, config: {} } },
  });
  await expect(page.locator(".file-title")).toHaveCount(1);
  await expect(page.locator(".file-title textarea")).toHaveValue("Note");
  const line = await firstLine(page);
  expect(line.first).toBe(false);
  expect(line.top).toBeGreaterThan(line.padding);
});
