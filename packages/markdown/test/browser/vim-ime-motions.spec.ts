import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

async function head(page: Page) {
  return (await page.evaluate(() => window.harness.viewState())).head;
}

async function text(page: Page) {
  return page.evaluate(() => window.harness.text);
}

/** Model an IME that reports Process on keydown (Chinese input sources). */
async function processKey(
  page: Page,
  code: string,
  data: string,
  extras: { shiftKey?: boolean } = {},
) {
  await page.evaluate(
    ({ code, data, shiftKey }) => {
      const target = document.activeElement;
      target?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Process",
          code,
          keyCode: 229,
          shiftKey,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      target?.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertCompositionText",
          data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { code, data, shiftKey: extras.shiftKey ?? false },
  );
}

async function chineseKey(page: Page, key: string, code: string) {
  await page.evaluate(
    ({ key, code }) => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { key, code },
  );
}

test("IME Process+KeyG with Shift runs G to the last line", async ({
  page,
}) => {
  const source = "one\ntwo\nthree";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await processKey(page, "KeyG", "G", { shiftKey: true });
  await expect.poll(() => head(page)).toBe(source.indexOf("three"));
  expect(await text(page)).toBe(source);
});

test("IME Process w and b move by word", async ({ page }) => {
  const source = "alpha beta gamma";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await processKey(page, "KeyW", "w");
  await expect.poll(() => head(page)).toBe(source.indexOf("beta"));
  await processKey(page, "KeyW", "w");
  await expect.poll(() => head(page)).toBe(source.indexOf("gamma"));
  await processKey(page, "KeyB", "b");
  await expect.poll(() => head(page)).toBe(source.indexOf("beta"));
  expect(await text(page)).toBe(source);
});

test("IME Process count then w moves by that many words", async ({ page }) => {
  const source = "one two three four";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await processKey(page, "Digit2", "2");
  await processKey(page, "KeyW", "w");
  await expect.poll(() => head(page)).toBe(source.indexOf("three"));
  expect(await text(page)).toBe(source);
});

test("IME Process dd deletes a line without leaking insert text", async ({
  page,
}) => {
  const source = "keep\ndelete me\nkeep2";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(
    (at) => window.harness.reveal(at),
    source.indexOf("delete"),
  );
  await page.keyboard.press("Escape");
  await processKey(page, "KeyD", "d");
  await processKey(page, "KeyD", "d");
  await expect.poll(() => text(page)).toBe("keep\nkeep2");
});

test("IME Process yy yanks and Process p puts without body leaks", async ({
  page,
}) => {
  const source = "alpha\nbeta";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await processKey(page, "KeyY", "y");
  await processKey(page, "KeyY", "y");
  await processKey(page, "KeyP", "p");
  await expect.poll(() => text(page)).toBe("alpha\nalpha\nbeta");
});

test("IME Process f then letter finds that character", async ({ page }) => {
  const source = "find the x here";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await processKey(page, "KeyF", "f");
  await processKey(page, "KeyX", "x");
  await expect.poll(() => head(page)).toBe(source.indexOf("x"));
  expect(await text(page)).toBe(source);
});

test("Chinese 。 repeats the last change like ASCII .", async ({ page }) => {
  const source = "abcd";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await page.keyboard.press("x");
  await expect.poll(() => text(page)).toBe("bcd");
  await chineseKey(page, "。", "Period");
  await expect.poll(() => text(page)).toBe("cd");
});

test("Chinese 。 in insert mode does not replay . as a command", async ({
  page,
}) => {
  const source = "ab";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await page.keyboard.press("x");
  await expect.poll(() => text(page)).toBe("b");
  await page.keyboard.press("i");
  // Remapping 。 → . here would repeat the delete. Insert keeps the glyph via
  // the ordinary input path; this only checks the command leak.
  await chineseKey(page, "。", "Period");
  await expect.poll(() => text(page)).toBe("b");
});

test("IME Process Period repeats the last change", async ({ page }) => {
  const source = "wxyz";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await page.keyboard.press("x");
  await expect.poll(() => text(page)).toBe("xyz");
  await processKey(page, "Period", ".");
  await expect.poll(() => text(page)).toBe("yz");
});
