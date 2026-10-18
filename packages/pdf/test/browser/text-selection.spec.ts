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

test("pressing Ctrl+C copies the selected text, and there is no Copy text button", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "text", text: "Synthetic page 1" });
  await expect(page.getByRole("button", { name: "Copy text" })).toHaveCount(0);
  await page.evaluate(() => {
    const target = window as unknown as { __copied?: string[] };
    target.__copied = [];
    document.addEventListener("copy", (event) => {
      target.__copied!.push(event.clipboardData?.getData("text/plain") ?? "");
    });
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __copied: string[] }).__copied,
      ),
    )
    .toEqual(["Synthetic page 1"]);
});

test("a text drag reports its text and line box, and the copy command copies the text", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect(
    page.getByRole("toolbar", { name: "PDF text selection actions" }),
  ).toBeVisible();
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "text", text: "Synthetic page 1" });
  const { pages } = (await lastSelection(page)) as {
    pages: { page: number; rects: number[][] }[];
  };
  expect(pages.map(({ page }) => page)).toEqual([1]);
  // The glyphs span x 72 to about 206, and y about 83 to 104.
  const [left, top, right, bottom] = pages[0]!.rects[0]!;
  expect(left).toBeGreaterThan(70);
  expect(left).toBeLessThan(75);
  expect(right).toBeGreaterThan(200);
  expect(right).toBeLessThan(210);
  expect(top).toBeGreaterThan(80);
  expect(bottom).toBeLessThan(108);

  // EmbedPDF draws the selection itself, so the viewer answers the copy command.
  const copied = await page.evaluate(() => {
    let text = "";
    const read = (event: ClipboardEvent) => {
      text = event.clipboardData?.getData("text/plain") ?? "";
    };
    document.addEventListener("copy", read);
    document.execCommand("copy");
    document.removeEventListener("copy", read);
    return text;
  });
  expect(copied).toBe("Synthetic page 1");
});

test("text selection no longer shows a Copy Link for Agent floating menu", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect(
    page.getByRole("toolbar", { name: "PDF text selection actions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy Link for Agent" }),
  ).toHaveCount(0);
});

test("region selection no longer shows a Copy Link for Agent floating menu", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await drag(page, at(60, 70), at(230, 120));
  await expect(
    page.getByRole("toolbar", { name: "PDF region actions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy Link for Agent" }),
  ).toHaveCount(0);
});

test("Escape clears a text selection, in the viewer and for the extension", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  const menu = page.getByRole("toolbar", {
    name: "PDF text selection actions",
  });
  await expect(menu).toBeVisible();
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: "text" });

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect.poll(() => lastSelection(page)).toBeNull();
});
