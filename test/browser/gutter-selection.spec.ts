/**
 * Line numbers behave like VS Code's: hovering paints nothing, a click
 * selects the whole line with its line break, a drag extends by whole lines
 * and shift+click extends to the clicked line. Fold arrows keep working, and
 * on dark themes no gutter cell or caret paints a solid box over the text.
 */
import { test, expect, type Page } from "@playwright/test";
import type { EditorState } from "@codemirror/state";
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

    // Click: the whole line with its break, as in VS Code.
    await page.mouse.click(four.x, four.y);
    expect(await selection(page)).toEqual({
      anchor: lineStart(4),
      head: lineStart(5),
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
      head: lineStart(7),
    });

    // Drag upward from 5 to 3: anchor line stays whole (its end), head at line 3's start.
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
      head: fencedStart(5),
    });
    // The fence stays rendered and nothing is drawn on it.
    await expect(fence).not.toContainText("```");
    const fenceBox = (await fence.boundingBox())!;
    const onFence = await page.evaluate(
      (box) =>
        [
          ...document.querySelectorAll(
            ".mw-selection-layer .cm-selectionBackground",
          ),
        ].filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.bottom > box.y + 1 &&
            rect.top < box.y + box.height - 1
          );
        }).length,
      fenceBox,
    );
    expect(onFence).toBe(0);
    // The empty line shows a thin stub, not a full-width band.
    const stubs = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".mw-selection-layer .cm-selectionBackground",
        ),
      ].map((element) => element.getBoundingClientRect().width),
    );
    expect(stubs).toHaveLength(1);
    expect(stubs[0]).toBeLessThanOrEqual(5);
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
      head: fencedStart(4),
    });
    await expect(fence).not.toContainText("```");
    expect(await copyText(page)).toBe("Before.\n");
    if (!vim) {
      await page.keyboard.press("Backspace");
      // TextDocument authority arrives asynchronously after the local edit.
      await expect
        .poll(() => page.evaluate(() => window.harness.text))
        .toBe(FENCED.replace("Before.\n", ""));
    }
  });
}

/**
 * Operation-level checks: a line-number selection is an ordinary selection
 * over the lines and their break, so editing commands, undo, the clipboard
 * and Vim treat it as text (document, caret, clipboard and undo together).
 */
const OPS = "one\n\nthree\nlast";
const opsStart = (n: number) =>
  OPS.split("\n")
    .slice(0, n - 1)
    .reduce((sum, line) => sum + line.length + 1, 0);
const text = (page: Page) => page.evaluate(() => window.harness.text);

async function clickLine(page: Page, n: number, shift = false) {
  const at = await centre(page, n);
  if (shift) {
    await page.keyboard.down("Shift");
  }
  await page.mouse.click(at.x, at.y);
  if (shift) {
    await page.keyboard.up("Shift");
  }
}

test("operations on line-number selections: delete, undo, type, paste, EOF, brackets", async ({
  page,
}) => {
  await open(page, OPS);
  await page.evaluate(() => window.harness.reveal(0));

  // Empty line 2: copy is the break; Backspace removes the line; undo restores
  // it; deleting again gives the same document.
  await clickLine(page, 2);
  expect(await selection(page)).toEqual({
    anchor: opsStart(2),
    head: opsStart(3),
  });
  expect(await copyText(page)).toBe("\n");
  await page.keyboard.press("Backspace");
  await expect.poll(() => text(page)).toBe("one\nthree\nlast");
  expect(await selection(page)).toEqual({
    anchor: opsStart(2),
    head: opsStart(2),
  });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);
  // Undo goes through the host's document history, which restores text but
  // not the selection: the caret is left collapsed at the line's start (a
  // known gap, tracked in review-multisel-round2.md). Pinned exactly so a
  // change either way is noticed.
  expect(await selection(page)).toEqual({
    anchor: opsStart(2),
    head: opsStart(2),
  });
  // Delete again from a fresh line selection: the same result.
  await clickLine(page, 2);
  await page.keyboard.press("Delete");
  await expect.poll(() => text(page)).toBe("one\nthree\nlast");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);

  // Typing over line 3 replaces the line and its break (VS Code).
  await clickLine(page, 3);
  await page.keyboard.type("X");
  await expect.poll(() => text(page)).toBe("one\n\nXlast");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);

  // The last line has no break: typing replaces only its text, never
  // merging it into the line above.
  await clickLine(page, 4);
  expect(await selection(page)).toEqual({
    anchor: opsStart(4),
    head: OPS.length,
  });
  expect(await copyText(page)).toBe("last");
  await page.keyboard.type("Y");
  await expect.poll(() => text(page)).toBe("one\n\nthree\nY");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);

  // Paste over a line.
  await clickLine(page, 1);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "pasted\n");
    document.activeElement!.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await expect.poll(() => text(page)).toBe("pasted\n\nthree\nlast");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);

  // A bracket over the selection: closeBrackets wraps the line and its
  // break, keeping the text selected inside; one undo restores the note.
  await clickLine(page, 3);
  await page.keyboard.type("(");
  await expect.poll(() => text(page)).toBe("one\n\n(three\n)last");
  expect(await selection(page)).toEqual({
    anchor: opsStart(3) + 1,
    head: opsStart(4) + 1,
  });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => text(page)).toBe(OPS);

  // A plain click in the text cancels a line selection.
  await clickLine(page, 2);
  const one = (await page.locator(".cm-line").first().boundingBox())!;
  await page.mouse.click(one.x + 4, one.y + one.height / 2);
  const after = await selection(page);
  expect(after.anchor).toBe(after.head);

  // Shift+click extends from the current line selection.
  await clickLine(page, 1);
  await clickLine(page, 3, true);
  expect(await selection(page)).toEqual({ anchor: 0, head: opsStart(4) });
});

test("Vim yanks, deletes, changes and puts a line-number selection as text", async ({
  page,
}) => {
  await open(page, OPS, undefined, {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");

  // y then P: the yanked text is the line and its break.
  await clickLine(page, 3);
  await page.keyboard.press("y");
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await page.keyboard.press("Shift+P");
  await expect.poll(() => text(page)).toBe("three\none\n\nthree\nlast");
  await page.keyboard.press("u");
  await expect.poll(() => text(page)).toBe(OPS);

  // p away from column zero: the register is characterwise (the line's text
  // and break), so it goes after the cursor inside line 1, not below it.
  await clickLine(page, 3);
  await page.keyboard.press("y");
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await page.keyboard.press("p");
  await expect.poll(() => text(page)).toBe("onthree\ne\n\nthree\nlast");
  // Multi-line characterwise p leaves the cursor at the start of the put
  // text, as in Vim.
  expect(await selection(page)).toMatchObject({ head: 2 });
  await page.keyboard.press("u");
  await expect.poll(() => text(page)).toBe(OPS);

  // d removes the line and its break; u restores it.
  await clickLine(page, 3);
  await page.keyboard.press("d");
  await expect.poll(() => text(page)).toBe("one\n\nlast");
  await page.keyboard.press("u");
  await expect.poll(() => text(page)).toBe(OPS);

  // c replaces the line and its break with typed text.
  await clickLine(page, 1);
  await page.keyboard.press("c");
  await page.keyboard.type("new\n");
  await page.keyboard.press("Escape");
  await expect.poll(() => text(page)).toBe("new\n\nthree\nlast");
});

for (const cancel of ["blur", "pointercancel"] as const) {
  test(`a cancelled line-number drag (${cancel}) stops extending the selection`, async ({
    page,
  }) => {
    const doc = "one\ntwo\nthree\nfour";
    await open(page, doc);
    await page.evaluate(() => window.harness.reveal(0));
    const one = await centre(page, 1);
    const three = await centre(page, 3);
    await page.mouse.move(one.x, one.y);
    await page.mouse.down();
    expect(await selection(page)).toEqual({ anchor: 0, head: 4 });
    await page.evaluate((type) => {
      if (type === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else {
        document.dispatchEvent(
          new PointerEvent("pointercancel", { bubbles: true }),
        );
      }
    }, cancel);
    // The button is still held (buttons: 1) but the gesture is over.
    await page.mouse.move(three.x, three.y, { steps: 5 });
    expect(await selection(page)).toEqual({ anchor: 0, head: 4 });
    await page.mouse.up();
    expect(await selection(page)).toEqual({ anchor: 0, head: 4 });
    expect(await page.evaluate(() => window.harness.text)).toBe(doc);
    // A fresh gesture still works.
    await page.mouse.move(three.x, three.y);
    await page.mouse.down();
    await page.mouse.move(one.x, one.y, { steps: 5 });
    await page.mouse.up();
    expect(await selection(page)).toEqual({ anchor: 14, head: 0 });
  });
}

test("a queued pointer release after the tracker is removed does not throw", async ({
  page,
}) => {
  await open(page, OPS);
  const errors: string[] = [];
  // Collab's synchronizer also needs fields the bare state lacks; only the
  // pointer tracker's own queued release is under test.
  page.on("pageerror", (error) => {
    if (!/sendableUpdates/.test(error.stack ?? "")) {
      errors.push(error.message);
    }
  });
  await page.evaluate(async () => {
    const view = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    view.contentDOM.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 }),
    );
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    // Remove every extension before the queued release runs.
    view.setState(
      (view.state.constructor as typeof EditorState).create({
        doc: view.state.doc,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(errors).toEqual([]);
});

test("Properties has no line number and the body retains source numbering", async ({
  page,
}) => {
  await open(
    page,
    "---\ntitle: Note\ntags:\n  - one\n  - two\naliases: []\n---\nBody\nEnd",
  );
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  for (let line = 1; line <= 7; line++) {
    await expect(number(page, line)).toHaveCount(0);
  }
  await expect(number(page, 8)).toBeVisible();
  await expect(number(page, 9)).toBeVisible();
});
