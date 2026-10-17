/**
 * Line numbers beside a rendered table, as measured in Obsidian 1.14.4
 * (docs/obsidian-measurements/tables/line-numbers.mjs): one number, that of
 * the table's first source line, at the top of the widget; the lines the table
 * hides are not numbered, and the next number starts right under the widget.
 */
import { test, expect } from "@playwright/test";
import { open } from "./harness";
import { geometry } from "../support/gutter-geometry";

const NOTE =
  "# Wider\n\n| Col A | Col B | Col C |\n| --- | --- | --- |\n| pipe | code | bold |\n| row 2 | more | cells |\n\nClick a cell.\nLast line\n";

test("a rendered table gets one number, aligned with its header row, and no gap after it", async ({
  page,
}) => {
  await open(page, NOTE);
  await expect(page.locator(".hybrid-table")).toHaveCount(1);
  const g = await geometry(page);
  // 1 heading, 2 blank, 3 the table; 4-6 are hidden; 7 is the blank line after it.
  expect(g.numbers.map((entry) => entry.n)).toEqual([
    "1",
    "2",
    "3",
    "7",
    "8",
    "9",
    "10",
  ]);
  const three = g.numbers.find((entry) => entry.n === "3")!;
  const seven = g.numbers.find((entry) => entry.n === "7")!;
  // The number cell starts where the widget starts and ends where it ends...
  expect(Math.abs(three.top - g.table.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(three.bottom - g.table.bottom)).toBeLessThanOrEqual(2);
  // ...so the next number begins directly under the table, with no gap.
  expect(Math.abs(seven.top - g.table.bottom)).toBeLessThanOrEqual(2);
  // The number sits level with the header row, not above the table.
  expect(Math.abs(three.textCentre - g.headerCentre)).toBeLessThanOrEqual(3);
});

test("numbers around two tables stay aligned after an edit adds a row", async ({
  page,
}) => {
  await open(
    page,
    "| a | b |\n| - | - |\n| 1 | 2 |\n\ntext\n\n| c | d |\n| - | - |\n| 3 | 4 |\n",
  );
  await expect(page.locator(".hybrid-table")).toHaveCount(2);
  const numbers = async () => (await geometry(page)).numbers.map((n) => n.n);
  expect(await numbers()).toEqual(["1", "4", "5", "6", "7", "10"]);
  await page
    .getByRole("button", { name: "Add row below" })
    .first()
    .click({ force: true });
  await expect.poll(numbers).toEqual(["1", "5", "6", "7", "8", "11"]);
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll(".hybrid-table")].map((table) => {
      const box = table.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }),
  );
  const g = await geometry(page);
  const first = g.numbers.find((n) => n.n === "1")!;
  expect(Math.abs(first.top - boxes[0]!.top)).toBeLessThanOrEqual(2);
  const after = g.numbers.find((n) => n.n === "5")!;
  expect(Math.abs(after.top - boxes[0]!.bottom)).toBeLessThanOrEqual(2);
});
