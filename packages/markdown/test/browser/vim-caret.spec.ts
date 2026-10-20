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
    features: {
      vim: { enabled: true, config: { caretStyle: "vscodevim" } },
    },
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
  // A see-through tint of the cursor colour; the glyph below shows through.
  await expect(shape).toHaveCSS(
    "background-color",
    "oklch(0.319161 0.0724438 251.176 / 0.45)",
  );
  await expect(shape).toHaveCSS("color", "rgba(0, 0, 0, 0)");
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

  // Insert mode is the editor's own caret: `editor.cursorStyle` decides.
  await page.keyboard.press("i");
  await expect(editor).toHaveAttribute("data-caret-mode", "insert");
  await expect(editor).toHaveAttribute("data-caret-style", "block-outline");
  for (const cursorStyle of ["underline", "block", "line-thin", "line"]) {
    await configure(page, { cursorStyle });
    await expect(editor).toHaveAttribute("data-caret-style", cursorStyle);
  }
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

  // VSCodeVim keeps the normal block while `r` waits for its character.
  await page.keyboard.press("r");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");
  await expect(editor).toHaveAttribute("data-caret-style", "block");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");

  // An operator waiting for its motion: the lower half of the character.
  await page.keyboard.press("d");
  await expect(editor).toHaveAttribute("data-caret-mode", "pending");
  await expect(editor).toHaveAttribute("data-caret-style", "half-block");
  await expect(shape).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const half = await shape.evaluate((element) => {
    const before = getComputedStyle(element, "::before");
    return [
      before.backgroundColor,
      parseFloat(before.height) / element.getBoundingClientRect().height,
    ];
  });
  expect(half[0]).toBe("oklch(0.319161 0.0724438 251.176 / 0.45)");
  expect(half[1]).toBeCloseTo(0.5, 2);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");

  // The search prompt holds focus, but the caret stays: a one-pixel underline.
  await page.keyboard.press("/");
  await expect(editor).toHaveAttribute("data-caret-mode", "prompt");
  await expect(editor).toHaveAttribute("data-caret-style", "underline-thin");
  await expect(caret).toBeVisible();
  await expect(caret).toHaveCSS("height", "1px");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-caret-mode", "normal");

  await page.keyboard.press("v");
  await expect(editor).toHaveAttribute("data-caret-mode", "visual");
  await expect(editor).toHaveAttribute("data-caret-style", "block");
  await expect(shape).toHaveText("x");
  // A tint over the active character (its glyph shows through) and the
  // editor's one-pixel line caret at the selection's end.
  await expect(shape).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(editor.locator(".mw-caret")).toHaveCount(2);
  const end = editor.locator('.mw-caret[data-part="end"]');
  await expect(end).toHaveCSS("width", "1px");
  await page.keyboard.press("l");
  await expect(shape).toHaveText("b");
  await expect
    .poll(async () => {
      const block = await caret.evaluate((node) =>
        node.getBoundingClientRect(),
      );
      const line = await end.evaluate((node) => node.getBoundingClientRect());
      // The line caret sits on the block's right edge.
      return Math.abs(line.left - (block.left + block.width));
    })
    .toBeLessThan(1);
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
    const vim = [...root.plugins].find(
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
  await expect(shape).toHaveCSS(
    "background-color",
    "oklch(0.319161 0.0724438 251.176 / 0.45)",
  );
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
    // Measured in VS Code 1.141: hard blink 500 ms on, 500 ms off, for as
    // long as the editor has focus; the others 0.5 s ease-in-out alternating
    // for 20 half cycles (10 s), then solid.
    const hard = cursorBlinking === "blink";
    if (cursorBlinking !== "solid") {
      await expect(shape).toHaveCSS("animation-duration", hard ? "1s" : "0.5s");
      await expect(shape).toHaveCSS(
        "animation-timing-function",
        hard ? "steps(1)" : "ease-in-out",
      );
      await expect(shape).toHaveCSS(
        "animation-iteration-count",
        hard ? "infinite" : "20",
      );
      await expect(shape).toHaveCSS(
        "animation-direction",
        hard ? "normal" : "alternate",
      );
    }
  }
  await configure(page, {
    cursorStyle: "line",
    cursorSmoothCaretAnimation: "on",
  });
  await expect(caret).toHaveCSS("transition-duration", "0.08s");
  await expect(caret).toHaveCSS(
    "transition-property",
    "left, top, width, height",
  );
  await expect(caret).toHaveCSS("transition-timing-function", "ease");
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
