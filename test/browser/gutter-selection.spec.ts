/**
 * Line numbers behave like VS Code's: hovering paints nothing, a click
 * selects the whole line with its line break, a drag extends by whole lines
 * and shift+click extends to the clicked line. Fold arrows keep working, and
 * on dark themes no gutter cell or caret paints a solid box over the text.
 */
import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const NOTE =
  "# Title\n\nFirst line of text here.\nsecond line starts with s.\nThird line.\nFourth.\n";
const lines = NOTE.split("\n");
const lineStart = (n: number) =>
  lines.slice(0, n - 1).reduce((sum, line) => sum + line.length + 1, 0);
const shots = process.env.GUTTER_SHOTS;

async function dark(page: Page) {
  await page.evaluate(() => {
    document.body.classList.remove("vscode-light");
    document.body.classList.add("vscode-dark");
    const style = document.documentElement.style;
    style.setProperty("--vscode-editor-background", "#1e1e1e");
    style.setProperty("--vscode-editor-foreground", "#d4d4d4");
    style.setProperty("--vscode-focusBorder", "#007fd4");
  });
}

const number = (page: Page, n: number) =>
  page.locator(".cm-lineNumbers .cm-gutterElement", {
    hasText: new RegExp(`^${n}$`),
  });

async function centre(page: Page, n: number) {
  const box = (await number(page, n).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const selection = (page: Page) =>
  page.evaluate(() => {
    const context = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!;
    const main = context.editor.view.state.selection.main;
    return { anchor: main.anchor, head: main.head };
  });

/** Opaque, non-transparent backgrounds in the gutters, by class. */
const solidGutterCells = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".cm-gutters .cm-gutterElement")]
      .filter((cell) => {
        const bg = getComputedStyle(cell).backgroundColor;
        return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      })
      .map((cell) => cell.className),
  );

for (const vim of [false, true]) {
  test(`line numbers select whole lines and paint nothing on hover (${vim ? "Vim" : "default"})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await open(page, NOTE, undefined, {
      features: { vim: { enabled: vim, config: {} } },
    });
    await dark(page);
    await page.evaluate((pos) => window.harness.reveal(pos), lineStart(4) + 0);

    const four = await centre(page, 4);
    await page.mouse.move(four.x, four.y);
    expect(await solidGutterCells(page)).toEqual([]);
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(4),
    });
    if (shots) {
      await page.screenshot({ path: `${shots}/hover${vim ? "-vim" : ""}.png` });
    }

    // A block caret is a tint: the glyph under it keeps the text colour.
    const caret = await page.evaluate(() => {
      const shape = document.querySelector(".mw-caret-shape");
      if (!shape) {
        return null;
      }
      const style = getComputedStyle(shape);
      return { bg: style.backgroundColor, color: style.color };
    });
    if (caret && vim) {
      expect(caret.color).toMatch(/rgba\(.*, 0\)|transparent/);
      expect(caret.bg).not.toMatch(/^rgb\(/);
    }

    // Click: the whole line. The editor selection stops at the line's end
    // (the next line is not touched); copy and delete add the break.
    await page.mouse.click(four.x, four.y);
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(5) - 1,
    });
    if (shots) {
      await page.screenshot({ path: `${shots}/click${vim ? "-vim" : ""}.png` });
    }

    // Shift+click extends to the clicked line.
    const six = await centre(page, 6);
    await page.keyboard.down("Shift");
    await page.mouse.click(six.x, six.y);
    await page.keyboard.up("Shift");
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(7) - 1,
    });

    // Drag upward from 5 to 3: anchor line stays whole (its end), head at line 3's start.
    const five = await centre(page, 5);
    const three = await centre(page, 3);
    await page.mouse.move(five.x, five.y);
    await page.mouse.down();
    await page.mouse.move(three.x, three.y, { steps: 5 });
    await page.mouse.up();
    expect(await selection(page)).toEqual({
      anchor: lineStart(6) - 1,
      head: lineStart(3),
    });
    if (shots) {
      await page.screenshot({ path: `${shots}/drag${vim ? "-vim" : ""}.png` });
    }
    expect(await page.evaluate(() => window.harness.text)).toBe(NOTE);
  });
}

test("fold arrows still fold beside the line numbers", async ({ page }) => {
  await open(page, "# One\ntext\nmore\n# Two\nend\n");
  await page
    .locator(".cm-foldGutter .cm-gutterElement span")
    .first()
    .click({ force: true });
  await expect(
    page
      .locator(
        ".cm-foldPlaceholder, .cm-foldGutter [title*='Unfold'], .mw-folded",
      )
      .first(),
  ).toBeAttached();
});

const FENCED = '# Code\n\nBefore.\n\n```json\n{ "a": 1 }\n```\n\nAfter.\n';
const fencedStart = (n: number) =>
  FENCED.split("\n")
    .slice(0, n - 1)
    .reduce((sum, line) => sum + line.length + 1, 0);

const copyText = (page: Page) =>
  page.evaluate(() => {
    const data = new DataTransfer();
    document.activeElement!.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
    return data.getData("text/plain");
  });

for (const vim of [false, true]) {
  test(`selecting the empty line before a fence leaves the fence rendered (${vim ? "Vim" : "default"})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await open(page, FENCED, undefined, {
      features: { vim: { enabled: vim, config: {} } },
    });
    await dark(page);
    await page.evaluate(() => window.harness.reveal(0));
    const fence = page.locator(".cm-line.md-code-fence-open");
    await expect(fence).not.toContainText("```");

    // Line 4 is empty; line 5 opens the fence.
    const four = await centre(page, 4);
    await page.mouse.click(four.x, four.y);
    expect(await selection(page)).toEqual({
      anchor: fencedStart(4),
      head: fencedStart(4),
    });
    // The fence stays rendered and nothing is drawn on it.
    await expect(fence).not.toContainText("```");
    const fenceBox = (await fence.boundingBox())!;
    const onFence = await page.evaluate(
      (box) =>
        [...document.querySelectorAll(".cm-selectionBackground")].filter(
          (element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.bottom > box.y + 1 &&
              rect.top < box.y + box.height - 1
            );
          },
        ).length,
      fenceBox,
    );
    expect(onFence).toBe(0);
    // The empty line shows VS Code's short sliver, not a full-width band.
    await expect(page.locator(".cm-line.mw-line-selected-empty")).toHaveCount(
      1,
    );
    if (shots) {
      await page.screenshot({
        path: `${shots}/fence${vim ? "-vim" : ""}.png`,
      });
    }
    // Copy takes the line break.
    expect(await copyText(page)).toBe("\n");

    // A text line: copy is the line plus its break; Backspace deletes both.
    const three = await centre(page, 3);
    await page.mouse.click(three.x, three.y);
    expect(await selection(page)).toEqual({
      anchor: fencedStart(3),
      head: fencedStart(4) - 1,
    });
    await expect(fence).not.toContainText("```");
    expect(await copyText(page)).toBe("Before.\n");
    if (!vim) {
      await page.keyboard.press("Backspace");
      expect(await page.evaluate(() => window.harness.text)).toBe(
        FENCED.replace("Before.\n", ""),
      );
    }
  });
}

test("a drag reveals syntax live, before the pointer is released", async ({
  page,
}) => {
  const note = "Plain start line.\n\nSome **bold** words here.\n\nEnd.\n";
  await open(page, note);
  await page.evaluate(() => window.harness.reveal(0));
  const bold = page.locator(".cm-line", { hasText: "Some" });
  await expect(bold).not.toContainText("**");
  const start = (await page
    .locator(".cm-line", { hasText: "Plain start" })
    .boundingBox())!;
  const end = (await bold.boundingBox())!;
  await page.mouse.move(start.x + 5, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 5, end.y + end.height / 2, {
    steps: 8,
  });
  // Still dragging: the bold marks are already revealed.
  await expect(bold).toContainText("**bold**");
  await page.mouse.up();
  await expect(bold).toContainText("**bold**");
});
