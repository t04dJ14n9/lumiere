import { expect, test } from "@playwright/test";
import { open } from "./harness";

const math = "before\n\nInline $x^2$ and after.\n\n$$\ny^2\n$$\n\nafter";

for (const expression of [
  "x^2",
  String.raw`e^{i\pi} + 1 = 0`,
  String.raw`\sqrt{a^2 + b^2}`,
]) {
  test(`typing after clicking the rendered inline math edge replaces only ${expression}`, async ({
    page,
  }) => {
    const source = math.replace("$x^2$", `$${expression}$`);
    await open(page, source);
    await page.evaluate(() =>
      window.harness.reveal(window.harness.text.length),
    );
    const formula = page.getByLabel(expression, { exact: true });
    await expect(formula).toBeVisible({ timeout: 15_000 });
    await formula
      .locator("svg")
      .last()
      .click({ position: { x: 1, y: 1 } });
    await expect
      .poll(() => page.evaluate(() => window.harness.capture()))
      .toMatchObject({
        from: source.indexOf(expression),
        to: source.indexOf(expression) + expression.length,
      });
    await expect
      .poll(() => page.evaluate(() => document.getSelection()?.toString()))
      .toBe(expression);
    await page.keyboard.type("xyz");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(source.replace(`$${expression}$`, "$xyz$"));
  });
}

for (const clicks of [1, 2]) {
  test(`typing after ${clicks} rendered block math clicks replaces only its body`, async ({
    page,
  }) => {
    await open(page, math);
    const formula = page.getByLabel("y^2", { exact: true });
    await expect(formula).toBeVisible({ timeout: 15_000 });
    for (let click = 0; click < clicks; click++) {
      await formula.locator("svg").click();
      await expect
        .poll(() => page.evaluate(() => window.harness.capture()))
        .toMatchObject({
          from: math.indexOf("y^2"),
          to: math.indexOf("y^2") + 3,
        });
      await expect
        .poll(() => page.evaluate(() => document.getSelection()?.toString()))
        .toBe("y^2");
    }
    await page.keyboard.type("xyz");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(math.replace("\ny^2\n", "\nxyz\n"));
  });
}

test("Vim i after clicking rendered block math inserts in the body", async ({
  page,
}) => {
  await open(page, math, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  const formula = page.getByLabel("y^2", { exact: true });
  await expect(formula).toBeVisible({ timeout: 15_000 });
  await formula.locator("svg").click();
  await expect
    .poll(() => page.evaluate(() => window.harness.capture()))
    .toMatchObject({
      from: math.indexOf("y^2"),
      to: math.indexOf("y^2") + 3,
    });
  await page.keyboard.press("i");
  await page.keyboard.type("q");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(math.replace("\ny^2\n", "\nqy^2\n"));
});

for (const [name, header, selector] of [
  ["generated title", "> [!note]", ".callout-title-text"],
  ["custom title", "> [!note] A custom title", ".callout-title-text"],
  ["folded title", "> [!note]- A folded title", ".callout-title-text"],
  ["body", "> [!note] A custom title", ".callout-content p"],
] as const) {
  test(`callout ${name} click selects source where typing lands`, async ({
    page,
  }) => {
    const callout = `${header}\n> A plain note callout.`;
    const source = `before\n\n${callout}\n\nafter`;
    await open(page, source);
    await page.evaluate(() =>
      window.harness.reveal(window.harness.text.length),
    );
    await page.locator(selector).click();
    await expect
      .poll(() => page.evaluate(() => window.harness.capture()))
      .toMatchObject({
        from: source.indexOf(callout),
        to: source.indexOf(callout) + callout.length,
      });
    await page.keyboard.type("xyz");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe("before\n\nxyz\n\nafter");
  });
}

test("callout fold button toggles without editing, then its body accepts input", async ({
  page,
}) => {
  const callout = "> [!note]- Folded\n> Body";
  await open(page, `before\n\n${callout}\n\nafter`);
  const body = page.locator(".callout-content p");
  await expect(body).toBeHidden();
  await page
    .getByRole("button", { name: "Toggle callout", exact: true })
    .click();
  await expect(body).toBeVisible();
  await expect(page.locator(".hybrid-callout")).toHaveCount(1);
  await body.click();
  await page.keyboard.type("xyz");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("before\n\nxyz\n\nafter");
});

test("typing after clicking a drawn horizontal rule replaces only the rule", async ({
  page,
}) => {
  const source = "before\n\n---\n\nafter";
  await open(page, source);
  await page.evaluate(() => window.harness.reveal(window.harness.text.length));
  const rule = page.locator(".cm-content .md-hr-line");
  await expect(rule).toHaveCount(1);
  await expect(rule).not.toContainText("---");
  await rule.click();
  await expect
    .poll(() => page.evaluate(() => window.harness.capture()))
    .toMatchObject({
      from: source.indexOf("---"),
      to: source.indexOf("---") + 3,
    });
  await page.keyboard.type("xyz");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("before\n\nxyz\n\nafter");
});
