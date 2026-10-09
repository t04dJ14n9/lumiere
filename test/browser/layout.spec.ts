import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("a wide table scrolls inside its own box, not the whole note", async ({
  page,
}) => {
  const columns = Array.from({ length: 30 }, (_, index) => `C${index}`);
  const header = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const row = `| ${columns.map(() => "value").join(" | ")} |`;
  await open(page, `Text\n\n${header}\n${rule}\n${row}\n\nafter`);
  const scroll = page.locator(".hybrid-table .table-scroll");
  await expect(scroll).toHaveCount(1);
  const sizes = await scroll.evaluate((element) => ({
    inner: element.scrollWidth,
    outer: element.clientWidth,
    note: document.querySelector(".cm-scroller")!.scrollWidth,
    viewport: document.querySelector(".cm-scroller")!.clientWidth,
  }));
  expect(sizes.inner).toBeGreaterThan(sizes.outer);
  expect(sizes.note).toBeLessThanOrEqual(sizes.viewport);
});
