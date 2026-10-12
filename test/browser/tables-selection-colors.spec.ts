import { expect, test, type Locator } from "@playwright/test";
import { open } from "./harness";

const INLINE = "`git.tencent.com` **bold** [link](https://example.com) $x^2$";
const TABLE = `before\n\n| ${INLINE} | control |\n| --- | --- |\n| ${INLINE} | ${INLINE} |\n\nafter\n`;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

async function colors(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, foreground: style.color };
  });
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const theme of [
  {
    name: "dark",
    foreground: "#cccccc",
    background: "#1e1e1e",
    code: "#292929",
    selection: "#264f78",
    link: "#9cdcfe",
    selected: "rgb(38, 79, 120)",
  },
  {
    name: "light",
    foreground: "#333333",
    background: "#ffffff",
    code: "#eeeeee",
    selection: "#add6ff",
    link: "#004080",
    selected: "rgb(173, 214, 255)",
  },
]) {
  test(`selected table inline backgrounds and readable text (${theme.name})`, async ({
    page,
  }) => {
    await open(page, TABLE);
    await page.evaluate((theme) => {
      document.body.classList.add(`vscode-${theme.name}`);
      const style = document.documentElement.style;
      style.setProperty("--vscode-editor-foreground", theme.foreground);
      style.setProperty("--vscode-editor-background", theme.background);
      style.setProperty("--vscode-textCodeBlock-background", theme.code);
      style.setProperty("--vscode-editor-selectionBackground", theme.selection);
      style.setProperty("--vscode-textLink-foreground", theme.link);
    }, theme);
    const table = page.locator(".hybrid-table");
    await expect(table.locator("mjx-container")).toHaveCount(3);
    const cells = table.locator("th, td");
    const originalCode = await colors(cells.nth(0).locator("code"));
    expect(originalCode.background).not.toBe(TRANSPARENT);
    const originalLink = await colors(cells.nth(0).locator("a"));
    await table.locator('.table-column-handle[data-index="0"]').click();
    await expect(table.locator(".table-cell-selected")).toHaveCount(2);

    // Check header and body cells through the real selection gesture. Transparent
    // inline backgrounds expose the cell's computed selection color unchanged.
    for (const index of [0, 2]) {
      const cell = cells.nth(index);
      expect((await colors(cell)).background).toBe(theme.selected);
      for (const selector of ["code", "strong", "a", "mjx-container", "svg"]) {
        const inline = cell.locator(selector);
        await expect(inline).toBeVisible();
        const computed = await colors(inline);
        expect(computed.background, selector).toBe(TRANSPARENT);
        expect(
          contrast(computed.foreground, theme.selected),
          selector,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect((await colors(cell.locator("code"))).foreground).toBe(
        originalCode.foreground,
      );
      expect((await colors(cell.locator("a"))).foreground).toBe(
        originalLink.foreground,
      );
      expect(
        Number(
          await cell
            .locator("strong")
            .evaluate((node) => getComputedStyle(node).fontWeight),
        ),
      ).toBeGreaterThanOrEqual(600);
    }
    expect(await colors(cells.nth(3).locator("code"))).toEqual(originalCode);

    // Moving selection restores the previously selected code's theme background.
    await table.locator('.table-column-handle[data-index="1"]').click();
    await expect(cells.nth(0)).toHaveAttribute("aria-selected", "false");
    expect(await colors(cells.nth(0).locator("code"))).toEqual(originalCode);
    expect(await colors(cells.nth(2).locator("code"))).toEqual(originalCode);
    expect((await colors(cells.nth(3).locator("code"))).background).toBe(
      TRANSPARENT,
    );
    expect(await page.evaluate(() => window.harness.text)).toBe(TABLE);
  });
}
