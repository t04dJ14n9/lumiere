import { expect, test } from "@playwright/test";
import { open } from "./harness";

for (const block of [
  "```mermaid\nflowchart LR\nA --> B\n```",
  "<div>\nhello\n</div>",
]) {
  for (const key of ["j", "k", "gj", "gk"]) {
    test(`${key} reveals ${block.startsWith("```") ? "Mermaid" : "HTML"} source`, async ({
      page,
    }) => {
      const source = `before\n\n${block}\n\nafter`;
      await open(page, source, "obsidian", {
        features: { vim: { enabled: true, config: {} } },
      });
      const down = key.endsWith("j");
      const start = down ? 7 : source.indexOf("\n\nafter") + 1;
      const target = down
        ? source.indexOf(block)
        : source.indexOf(block) + block.lastIndexOf("\n") + 1;
      await page.evaluate((at) => window.harness.reveal(at), start);
      for (const letter of key) {
        await page.keyboard.press(letter);
      }
      await expect
        .poll(() =>
          page.evaluate(async () => (await window.harness.viewState()).head),
        )
        .toBe(target);
      await expect(
        page.locator(".cm-line").filter({ hasText: block.split("\n")[0]! }),
      ).toBeVisible();
    });
  }
}

test("ordinary Vim counts, operators, visual selection and source mode remain native", async ({
  page,
}) => {
  const source = "one\ntwo\nthree\nfour\nfive";
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("2");
  await page.keyboard.press("j");
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.harness.viewState()).head),
    )
    .toBe(8);
  await page.keyboard.press("v");
  await page.keyboard.press("k");
  const selection = await page.evaluate(() => window.harness.viewState());
  expect(selection.anchor).not.toBe(selection.head);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("d");
  await page.keyboard.press("j");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("three\nfour\nfive");
  await page.evaluate(() => window.harness.mode());
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("j");
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.harness.viewState()).head),
    )
    .toBe(6);
});
