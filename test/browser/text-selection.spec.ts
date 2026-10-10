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
      target.__copied!.push(
        event.clipboardData?.getData("text/plain") ?? "",
      );
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

test("Copy Link for Agent right after a text drag reports the selection before the ask", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await page
    .getByRole("toolbar", { name: "PDF text selection actions" })
    .getByRole("button", { name: "Copy Link for Agent" })
    .click();
  await expect
    .poll(async () =>
      (await messages(page)).some(
        (message) => message.type === "copyLinkForAgent",
      ),
    )
    .toBe(true);
  const order = (await messages(page)).flatMap((message) =>
    message.type === "copyLinkForAgent"
      ? ["ask"]
      : message.type === "selection" &&
          (message.selection as { kind?: string } | null)?.kind === "text"
        ? ["text"]
        : [],
  );
  expect(order.indexOf("text")).toBeGreaterThanOrEqual(0);
  expect(order.indexOf("text")).toBeLessThan(order.indexOf("ask"));
});

test("Copy Link for Agent, from a text or region menu, comes after the full selection report", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  const textMenu = page.getByRole("toolbar", {
    name: "PDF text selection actions",
  });
  // No Copy text button: Ctrl/Cmd+C copies the selected text.
  await expect(textMenu.getByRole("button")).toHaveText([
    "Copy Link for Agent",
  ]);
  await textMenu.getByRole("button", { name: "Copy Link for Agent" }).click();
  await expect
    .poll(async () => (await messages(page)).at(-1)?.type)
    .toBe("copyLinkForAgent");
  const beforeAsk = (await messages(page))
    .filter((message) => message.type === "selection")
    .at(-1);
  expect(beforeAsk?.selection).toMatchObject({
    kind: "text",
    text: "Synthetic page 1",
  });

  // The ask follows the region's report with its text and snapshot.
  await page.keyboard.press("Escape");
  await drag(page, at(60, 70), at(230, 120));
  const regionMenu = page.getByRole("toolbar", { name: "PDF region actions" });
  await expect(regionMenu.getByRole("button")).toHaveText([
    "Copy Link for Agent",
  ]);
  await regionMenu.getByRole("button", { name: "Copy Link for Agent" }).click();
  await expect
    .poll(
      async () =>
        (await messages(page)).filter(
          (message) => message.type === "copyLinkForAgent",
        ).length,
    )
    .toBe(2);
  const all = await messages(page);
  const ask =
    all.length -
    1 -
    [...all]
      .reverse()
      .findIndex((message) => message.type === "copyLinkForAgent");
  const last = all
    .slice(0, ask)
    .filter((message) => message.type === "selection")
    .at(-1);
  expect(last?.selection).toMatchObject({
    kind: "region",
    text: "Synthetic page 1",
  });
  expect(last?.image).toMatch(/^data:image\/png;base64,/);
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
