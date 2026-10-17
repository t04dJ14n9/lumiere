import { test, expect } from "@playwright/test";
import { open } from "./harness";
test("encoded native heading delivery stays in its addressed pane and latest reveal wins", async ({
  page,
}) => {
  const text =
    "# Start\n\n" +
    "filler\n\n".repeat(50) +
    "## 目标 heading\n\n" +
    "filler\n\n".repeat(50) +
    "## Last\n";
  await page.setViewportSize({ width: 1200, height: 700 });
  await open(page, text);
  await page.addStyleTag({
    content:
      "#app { display: flex; flex-direction: row; height: 700px; } .panel { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(async () => {
    await window.harness.open("obsidian");
  });
  await expect
    .poll(() => page.evaluate(() => window.harness.navigationReady(1)))
    .toBe(true);
  expect(
    await page.evaluate(async () =>
      window.harness.navigate({ fragment: "%E7%9B%AE%E6%A0%87-heading" }, 1),
    ),
  ).toBe(true);
  const states = await page.evaluate(async () => [
    await window.harness.viewState(0),
    await window.harness.viewState(1),
  ]);
  expect(states[0]!.scrollTop).toBe(0);
  expect(states[1]!.scrollTop).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await window.harness.navigate({ fragment: "Last" }, 1);
    await window.harness.navigate({ fragment: "Start" }, 1);
  });
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.harness.viewState(1)).scrollTop),
    )
    .toBe(0);
});
