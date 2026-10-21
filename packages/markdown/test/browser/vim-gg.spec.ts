import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

async function press(page: Page, keys: string) {
  for (const key of keys) {
    await page.keyboard.press(key === " " ? "Space" : key);
  }
}

async function head(page: Page) {
  return (await page.evaluate(() => window.harness.viewState())).head;
}

/** Model an IME that reports Process on keydown (Chinese input sources). */
async function processLetter(page: Page, code: string, letter: string) {
  await page.evaluate(
    ({ code, letter }) => {
      const target = document.activeElement;
      target?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Process",
          code,
          keyCode: 229,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Some IMEs then deliver the letter via beforeinput/input; Lumière's
      // normal-mode beforeinput guard suppresses that path.
      target?.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertCompositionText",
          data: letter,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { code, letter },
  );
}

test("gg jumps to the first line in a plain note", async ({ page }) => {
  const source = "one\ntwo\nthree\nfour";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  const end = source.length - 1;
  await page.evaluate((at) => window.harness.reveal(at), end);
  await page.keyboard.press("Escape");
  await expect.poll(() => head(page)).toBe(end);
  await press(page, "gg");
  await expect.poll(() => head(page)).toBe(0);
});

test("gg with frontmatter lands on the first body line", async ({ page }) => {
  const source = "---\ntitle: T\n---\nFirst body\nSecond";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  const at = source.indexOf("Second");
  await page.evaluate((pos) => window.harness.reveal(pos), at);
  await page.keyboard.press("Escape");
  await press(page, "gg");
  const bodyStart = source.indexOf("First");
  await expect.poll(() => head(page)).toBe(bodyStart);
});

test("G jumps to the last line", async ({ page }) => {
  const source = "one\ntwo\nthree";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  await press(page, "G");
  await expect.poll(() => head(page)).toBe(source.indexOf("three"));
});

test("IME Process+KeyG twice still runs gg to the first line", async ({
  page,
}) => {
  const source = "one\ntwo\nthree\nfour";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  const end = source.length - 1;
  await page.evaluate((at) => window.harness.reveal(at), end);
  await page.keyboard.press("Escape");
  await expect.poll(() => head(page)).toBe(end);
  await processLetter(page, "KeyG", "g");
  await processLetter(page, "KeyG", "g");
  await expect.poll(() => head(page)).toBe(0);
  expect(await page.evaluate(() => window.harness.text)).toBe(source);
});
