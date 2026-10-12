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
    if (shots) await page.screenshot({ path: `${shots}/hover${vim ? "-vim" : ""}.png` });

    // A block caret is a tint: the glyph under it keeps the text colour.
    const caret = await page.evaluate(() => {
      const shape = document.querySelector(".mw-caret-shape");
      if (!shape) return null;
      const style = getComputedStyle(shape);
      return { bg: style.backgroundColor, color: style.color };
    });
    if (caret && vim) {
      expect(caret.color).toMatch(/rgba\(.*, 0\)|transparent/);
      expect(caret.bg).not.toMatch(/^rgb\(/);
    }

    // Click: the whole line, line break included.
    await page.mouse.click(four.x, four.y);
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(5),
    });
    if (shots) await page.screenshot({ path: `${shots}/click${vim ? "-vim" : ""}.png` });

    // Shift+click extends to the clicked line.
    const six = await centre(page, 6);
    await page.keyboard.down("Shift");
    await page.mouse.click(six.x, six.y);
    await page.keyboard.up("Shift");
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(7),
    });

    // Drag upward from 5 to 3: anchor line stays whole, head at line 3's start.
    const five = await centre(page, 5);
    const three = await centre(page, 3);
    await page.mouse.move(five.x, five.y);
    await page.mouse.down();
    await page.mouse.move(three.x, three.y, { steps: 5 });
    await page.mouse.up();
    expect(await selection(page)).toEqual({
      anchor: lineStart(6),
      head: lineStart(3),
    });
    if (shots) await page.screenshot({ path: `${shots}/drag${vim ? "-vim" : ""}.png` });
    expect(await page.evaluate(() => window.harness.text)).toBe(NOTE);
  });
}

test("fold arrows still fold beside the line numbers", async ({ page }) => {
  await open(page, "# One\ntext\nmore\n# Two\nend\n");
  await page.locator(".cm-foldGutter .cm-gutterElement span").first().click({ force: true });
  await expect(page.locator(".cm-foldPlaceholder, .cm-foldGutter [title*='Unfold'], .mw-folded").first()).toBeAttached();
});
