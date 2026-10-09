import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

const settings = {
  fontFamily: "monospace",
  fontSize: 20,
  cursorStyle: "block-outline",
  cursorWidth: 3,
  cursorBlinking: "solid",
  cursorSmoothCaretAnimation: "off",
};

async function configure(page: Page, values: Record<string, unknown>) {
  await page.evaluate((values) => window.harness.configureEditor(values), {
    ...settings,
    ...values,
  });
}

test("caret matches Vim modes and native typing styles, colours, blinking and movement", async ({
  page,
}) => {
  await open(page, "abcd\n\nTail", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--vscode-editorCursor-foreground",
      "#123456",
    );
    document.documentElement.style.setProperty(
      "--vscode-editorCursor-background",
      "#fedcba",
    );
  });
  await configure(page, {});
  await page.evaluate(() => window.harness.reveal(0));
  const editor = page.locator(".mw-editor");
  const caret = editor.locator(".mw-caret").first();
  const shape = caret.locator(".mw-caret-shape");
  const characterWidth = await page
    .locator(".cm-line")
    .first()
    .evaluate((line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode()!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      return range.getBoundingClientRect().width;
    });

  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");
  await expect(editor).toHaveAttribute("data-caret-style", "block");
  await expect(caret).toBeVisible();
  await expect(shape).toHaveText("a");
  await expect(shape).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await expect(shape).toHaveCSS("color", "rgb(254, 220, 186)");
  await expect(shape).toHaveCSS("animation-name", "none");
  await expect
    .poll(async () =>
      Math.abs(
        parseFloat(
          await caret.evaluate((element) => getComputedStyle(element).width),
        ) - characterWidth,
      ),
    )
    .toBeLessThan(1);
  await expect(page.locator(".cm-vimCursorLayer")).toHaveCSS("display", "none");

  await page.keyboard.press("i");
  await expect(editor).toHaveAttribute("data-caret-mode", "insert");
  await expect(editor).toHaveAttribute("data-caret-style", "line");
  await expect(caret).toHaveCSS("width", "3px");
  await expect(caret).toBeVisible();
  await expect(shape).toHaveText("");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+R");
  await expect(editor).toHaveAttribute("data-caret-mode", "replace");
  await expect(editor).toHaveAttribute("data-caret-style", "underline");
  await expect(caret).toHaveCSS("height", "2px");
  await expect(caret).toBeVisible();
  await expect
    .poll(async () =>
      parseFloat(
        await caret.evaluate((element) => getComputedStyle(element).width),
      ),
    )
    .toBeGreaterThan(3);
  await page.keyboard.press("x");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("xbcd\n\nTail");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");

  await page.keyboard.press("r");
  await expect(editor).toHaveAttribute("data-caret-mode", "replace");
  await expect(caret).toHaveCSS("height", "2px");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");

  await page.keyboard.press("v");
  await expect(editor).toHaveAttribute("data-caret-mode", "visual");
  await expect(editor).toHaveAttribute("data-caret-style", "block");
  await expect(shape).toHaveText("x");
  await page.keyboard.press("l");
  await expect(shape).toHaveText("b");
  await expect
    .poll(async () =>
      Math.abs(
        parseFloat(
          await caret.evaluate((element) => getComputedStyle(element).width),
        ) - characterWidth,
      ),
    )
    .toBeLessThan(1);
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const root = window.harness.views[0]!;
    const vim = [...root.runtime.fibers].find(
      (fiber) => fiber.definition.name === "vim",
    )!;
    await vim.dispose();
    await root.settled();
  });
  await expect(editor).toHaveAttribute("data-caret-mode", "typing");
  for (const [cursorStyle, dimension, value] of [
    ["line", "width", "3px"],
    ["line-thin", "width", "1px"],
    ["underline", "height", "2px"],
    ["underline-thin", "height", "1px"],
  ]) {
    await configure(page, { cursorStyle });
    await expect(editor).toHaveAttribute("data-caret-style", cursorStyle!);
    await expect(caret).toHaveCSS(dimension!, value!);
  }
  await configure(page, { cursorStyle: "block-outline" });
  await expect(shape).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(shape).toHaveCSS(
    "box-shadow",
    "rgb(18, 52, 86) 0px 0px 0px 1px inset",
  );
  await configure(page, { cursorStyle: "block" });
  await expect(shape).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await expect(shape).not.toHaveText("");

  for (const cursorBlinking of [
    "blink",
    "smooth",
    "phase",
    "expand",
    "solid",
  ]) {
    await configure(page, { cursorStyle: "line", cursorBlinking });
    await expect(shape).toHaveCSS(
      "animation-name",
      cursorBlinking === "solid" ? "none" : `mw-caret-${cursorBlinking}`,
    );
    await expect(shape).toHaveCSS(
      "animation-timing-function",
      cursorBlinking === "blink" ? "steps(1)" : "linear",
    );
  }
  await configure(page, {
    cursorStyle: "line",
    cursorSmoothCaretAnimation: "on",
  });
  await expect(caret).toHaveCSS("transition-duration", "0.08s");
  await expect(caret).toHaveCSS("transition-property", "transform, left, top");
  await configure(page, {
    cursorStyle: "line",
    cursorSmoothCaretAnimation: "explicit",
  });
  await page.keyboard.insertText("z");
  await expect(caret).toHaveCSS("transition-duration", "0s");
  await page.keyboard.press("ArrowRight");
  await expect(caret).toHaveCSS("transition-duration", "0.08s");
  await configure(page, {
    cursorStyle: "line",
    cursorSmoothCaretAnimation: "off",
  });
  await expect(caret).toHaveCSS("transition-duration", "0s");
});
