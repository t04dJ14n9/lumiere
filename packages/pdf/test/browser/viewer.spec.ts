import { expect, test } from "@playwright/test";
import { open, messages } from "./viewer-support";

test("opens the PDF, shows the page count and reports the nested outline", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("1");
  await expect(
    page.getByRole("toolbar", { name: "PDF toolbar" }),
  ).toContainText("of 12");
  await expect
    .poll(
      async () =>
        (await messages(page)).find((message) => message.type === "outline")
          ?.items,
    )
    .toEqual([
      {
        title: "Part One",
        page: 1,
        top: 0,
        children: [
          { title: "Section 1.1", page: 2, top: 0, children: [] },
          { title: "Section 1.2", page: 3, top: 0, children: [] },
        ],
      },
      {
        title: "Part Two",
        page: 6,
        top: 0,
        children: [{ title: "Section 2.1", page: 9, top: 130, children: [] }],
      },
    ]);
});

test("VS Code's default webview styles neither shift the viewer nor outline clicked links", async ({
  page,
}) => {
  await open(page);
  const width = page.viewportSize()!.width;
  const viewer = (await page.locator(".viewer").boundingBox())!;
  expect([viewer.x, viewer.width]).toEqual([0, width]);
  const find = (await page
    .getByRole("button", { name: "Find in PDF" })
    .boundingBox())!;
  expect(find.x + find.width).toBeLessThanOrEqual(width);

  await page.getByRole("textbox", { name: "Page" }).fill("2");
  await page.getByRole("textbox", { name: "Page" }).press("Enter");
  const link = page.getByRole("link", {
    name: "Open https://example.com/paper",
  });
  await link.click();
  await expect(link).toBeFocused();
  expect(
    await link.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("none");
});

test("in a narrow editor the toolbar wraps instead of hiding controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 300, height: 600 });
  await open(page);
  const toolbar = page.getByRole("toolbar", { name: "PDF toolbar" });
  for (const button of await toolbar.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(300);
  }
  // "of 12" stays on one line.
  const suffix = (await toolbar.getByText("of 12").boundingBox())!;
  expect(suffix.height).toBeLessThan(20);
});
