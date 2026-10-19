import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("Properties inline widgets, pending rows, pill keys and shared presentation state", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const original =
    '---\ntitle: Hello\ncount: 3\ndone: false\nlist: [a, b]\ntags: [one]\naliases: [Other]\nrelated: "[[Target]]"\n---\nBody';
  await open(page, original);
  const sheet = page.locator(".metadata-container").first();
  const row = (key: string) => sheet.locator(`[data-property-key="${key}"]`);
  const name = row("title").locator("[data-property-name]");
  const value = row("title").locator("[data-property-input]");
  await name.click();
  await page.keyboard.press("Tab");
  await expect(value).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row("title")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row("count")).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(row("count")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeFocused();

  await name.click();
  await page.keyboard.press("Enter");
  await expect(value).toBeFocused();
  await value.fill("a: b # c");
  await page.keyboard.press("Enter");
  await expect(row("title")).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain('title: "a: b # c"');
  const checkbox = row("done").locator("input[type=checkbox]");
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("done: true");

  const pillInput = row("list").locator("[data-property-list-input]");
  await pillInput.fill("c");
  await page.keyboard.press("Enter");
  await expect(pillInput).toBeFocused();
  await expect(row("list").locator("[data-property-chip]")).toHaveCount(3);
  await page.keyboard.press("Backspace");
  await expect(row("list").locator('[data-property-chip="2"]')).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(row("list").locator("[data-property-chip]")).toHaveCount(2);
  await row("list").locator('[data-property-chip="0"]').focus();
  await page.keyboard.press("Enter");
  const draft = row("list").locator("[data-property-chip-edit]");
  await expect(draft).toBeFocused();
  await draft.fill("edited");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("edited");
  const tags = row("tags").locator("[data-property-list-input]");
  await tags.fill("#new");
  await page.keyboard.press("Enter");
  await expect(row("tags").locator(".multi-select-pill-content")).toHaveText([
    "one",
    "new",
  ]);
  await row("tags").locator('[data-property-remove="1"]').click();
  await expect(row("tags").locator("[data-property-chip]")).toHaveCount(1);
  // The sheet redraws before the note reaches the host: wait for the note.
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .not.toContain("- new");

  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  const beforePending = await page.evaluate(() => window.harness.text);
  await page.keyboard.press("ControlOrMeta+;");
  const pending = sheet.locator("[data-property-new]");
  await expect(pending.locator("input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pending).toHaveCount(1);
  expect(await page.evaluate(() => window.harness.text)).toBe(beforePending);
  await pending.locator("input").fill("title");
  await page.keyboard.press("Enter");
  await expect(pending.locator("input")).toBeFocused();
  expect(await page.evaluate(() => window.harness.text)).toBe(beforePending);
  await pending.locator("input").fill("st");
  await expect(pending.locator('[role="option"]')).toHaveText([
    "status",
    "list",
  ]);
  await page.keyboard.press("Enter");
  await expect(row("status").locator("[data-property-input]")).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("\nstatus:\n");

  const beforeType = await page.evaluate(() => window.harness.text);
  await row("count").locator("[data-property-type]").first().click();
  await page
    .getByRole("menuitem", { name: "Property type", exact: true })
    .hover();
  await page.getByRole("menuitemradio", { name: "Text", exact: true }).click();
  await expect(
    row("count").locator(".metadata-property-warning-icon"),
  ).toHaveAttribute("title", "Type mismatch, expected Text");
  expect(await page.evaluate(() => window.harness.text)).toBe(beforeType);
  await row("aliases").locator(".metadata-property-icon").click();
  await page
    .getByRole("menuitem", { name: "Property type", exact: true })
    .hover();
  await expect(
    page.getByRole("menuitemradio", { name: "Text", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sheet.locator("[data-properties-heading]").click();
  await expect(sheet).toHaveClass(/is-collapsed/);
  await page.evaluate(async () => {
    await window.harness.open();
  });
  await expect(page.locator(".metadata-container").nth(1)).toHaveClass(
    /is-collapsed/,
  );
});
