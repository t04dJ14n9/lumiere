import { expect, test } from "@playwright/test";
import { open } from "./harness";
import { readFileSync } from "node:fs";

for (const vim of [false, true]) {
  test(`follow caret links with Mod-Enter, Vim ${vim}`, async ({ page }) => {
    const source =
      "---\ntitle: Example\n---\n\n[web](https://example.com)\n\n[file](Other.md)\n\n[[Target#Heading]]\n\n[local](#heading)\n\n# Heading\n\nplain text";
    await open(page, source, "obsidian", {
      features: { vim: { enabled: vim, config: {} } },
    });
    for (const [label, target] of [
      ["web", "https://example.com"],
      ["file", "Other.md"],
      ["Target", "Target#Heading"],
    ]) {
      await page.evaluate(
        (at) => window.harness.reveal(at),
        source.indexOf(label!) + 1,
      );
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect
        .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
        .toBe(target);
    }
    await page.evaluate(
      (at) => window.harness.reveal(at),
      source.indexOf("local") + 1,
    );
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.harness.viewState()).head),
      )
      .toBe(source.indexOf("# Heading"));
    const opened = await page.evaluate(() => window.harness.opened.length);
    await page.evaluate(
      (at) => window.harness.reveal(at),
      source.indexOf("plain text"),
    );
    await page.keyboard.press("ControlOrMeta+Enter");
    expect(await page.evaluate(() => window.harness.opened.length)).toBe(
      opened,
    );
    const input = page.locator(
      '[data-property-key="title"] [data-property-input]',
    );
    await page.evaluate(
      (at) => window.harness.reveal(at),
      source.indexOf("web") + 1,
    );
    await input.focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    expect(await page.evaluate(() => window.harness.opened.length)).toBe(
      opened,
    );
    await expect(input).toHaveText("Example");
  });
}

test("reading typography separates defaults and UI from deliberate editor fonts", async ({
  page,
}) => {
  await open(
    page,
    "---\ntags: [fixture]\n---\n\n# Tags\n\nText #idea and `code`.\n\n```js\nconst x = 1;\n```",
    "obsidian",
  );
  const style = () =>
    page.evaluate(() => {
      const font = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!).fontFamily;
      return {
        prose: font(".cm-scroller"),
        properties: font(".properties"),
        code: font(".md-inline-code"),
        size: getComputedStyle(document.querySelector(".cm-scroller")!)
          .fontSize,
      };
    });
  await expect.poll(async () => (await style()).prose).toContain("sans-serif");
  expect((await style()).properties).toContain("sans-serif");
  expect((await style()).code).toContain("monospace");
  await page.evaluate(() =>
    window.harness.configureEditor({
      fontFamily: "Menlo",
      fontSize: 22,
      lineHeight: 1.8,
    }),
  );
  await expect.poll(async () => (await style()).prose).toContain("Menlo");
  expect((await style()).properties).toContain("sans-serif");
  expect((await style()).size).toBe("22px");
});

test("Tags reading layout in light and dark themes", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  const source = readFileSync("test/fixtures/vault/Tags.md", "utf8");
  await open(page, source, "obsidian");
  await page.evaluate((at) => window.harness.reveal(at), source.length);
  for (const dark of [false, true]) {
    await page.evaluate((dark) => {
      const style = document.documentElement.style;
      style.setProperty(
        "--vscode-editor-background",
        dark ? "#1e1e1e" : "#ffffff",
      );
      style.setProperty(
        "--vscode-editor-foreground",
        dark ? "#d4d4d4" : "#202020",
      );
      style.setProperty(
        "--vscode-descriptionForeground",
        dark ? "#a0a0a0" : "#606060",
      );
      style.setProperty(
        "--vscode-textLink-foreground",
        dark ? "#4daafc" : "#006ab1",
      );
    }, dark);
    await expect(page.locator(".properties")).toBeVisible();
    await expect(page.locator(".md-tag").first()).toBeVisible();
    await expect(page.locator(".md-tag").first()).toHaveCSS(
      "background-color",
      /rgba?\(/,
    );
  }
});

test("Mod-Enter leaves the Vim prompt and dialogs alone", async ({ page }) => {
  const source = "[web](https://example.com)\n\nplain";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(
    (at) => window.harness.reveal(at),
    source.indexOf("web") + 1,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press(":");
  const prompt = page.locator(".cm-vim-panel input, .cm-panels input");
  await expect(prompt.first()).toBeFocused();
  const opened = await page.evaluate(() => window.harness.opened.length);
  await page.keyboard.press("ControlOrMeta+Enter");
  expect(await page.evaluate(() => window.harness.opened.length)).toBe(opened);
});
