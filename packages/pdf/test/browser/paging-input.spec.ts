import { expect, test, type Page } from "@playwright/test";
import {
  act,
  lastView,
  openView,
  pageIndexes,
  viewMenu,
} from "./view-controls-support";

/** Where the viewer is: scroll offsets and the first page in view. */
async function where(page: Page) {
  const scroll = await page.locator(".viewport").evaluate((viewport) => ({
    left: Math.round(viewport.scrollLeft),
    top: Math.round(viewport.scrollTop),
    room: Math.round(
      viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft,
    ),
    overflowsX: viewport.scrollWidth > viewport.clientWidth + 1,
  }));
  const view = await lastView(page);
  return { ...scroll, page: view?.readingPage, shown: await pageIndexes(page) };
}

async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

const ZOOMS = [
  ["fit width", "fitWidth"],
  ["fit page", "fitPage"],
  ["zoomed 200%", 200],
] as const;

// Every combination: the arrow keys do what the layout allows, and Left undoes Right.
for (const scrollMode of ["continuous", "paged"] as const) {
  for (const pageLayout of ["single", "spread", "spreadCover"] as const) {
    for (const scrollDirection of ["vertical", "horizontal"] as const) {
      for (const [zoomName, defaultZoom] of ZOOMS) {
        test(`ArrowRight/ArrowLeft: ${scrollMode} ${pageLayout} ${scrollDirection} ${zoomName}`, async ({
          page,
        }) => {
          await openView(page, {
            defaultZoom,
            pageLayout,
            scrollMode,
            scrollDirection,
          });
          await settled(page);
          const before = await where(page);
          await page.keyboard.press("ArrowRight");
          await settled(page);
          const after = await where(page);
          const panned =
            after.left !== before.left && after.page === before.page;
          const turned =
            after.page !== before.page ||
            after.shown.join() !== before.shown.join();
          if (scrollMode === "continuous" && before.room > 1) {
            // Room to pan: it pans, by one arrow step or what was left.
            expect(after.left - before.left).toBe(Math.min(40, before.room));
            expect(after.page).toBe(before.page);
          } else if (scrollMode === "continuous" && before.overflowsX) {
            // Zoomed and at the right edge: a continuous page just stops.
            expect(after).toEqual(before);
          } else if (scrollMode === "continuous") {
            // The page fits across: the next page or spread.
            expect(turned).toBe(true);
            expect(after.page).toBeGreaterThan(before.page!);
          } else {
            // Paged: pan within the page while there is room, else turn it.
            expect(panned || turned).toBe(true);
            expect(panned && turned).toBe(false);
            if (panned) {
              expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(
                40,
              );
            }
          }
          if (!panned && !turned) {
            return;
          }
          // A pan is undone by one Left. A turned page opens where its reader
          // left off on the other axis, so Left may pan first, then turns back.
          let back = after;
          for (let i = 0; i < 40; i++) {
            await page.keyboard.press("ArrowLeft");
            await settled(page);
            back = await where(page);
            if (
              back.shown.join() === before.shown.join() &&
              back.page === before.page
            ) {
              break;
            }
            if (panned) {
              break;
            }
          }
          if (panned) {
            expect(back.left).toBe(before.left);
          }
          expect(back.page).toBe(before.page);
          expect(back.shown).toEqual(before.shown);
        });
      }
    }
  }
}

test("keys work after clicking a page, after a toolbar button and after the View picker took focus", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "fitPage", scrollMode: "paged" });
  await settled(page);
  expect(await pageIndexes(page)).toEqual([0]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
  await page
    .locator(".page")
    .first()
    .click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pageIndexes(page)).toEqual([2]);
  // A toolbar button holds focus after a click.
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page
    .getByRole("button", { name: "Fit page", exact: true })
    .click()
    .catch(() => undefined);
  await act(page, { action: "fitPage" });
  await settled(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
  // The View picker's controls keep their own keys, and closing it gives the keys back.
  await viewMenu(page);
  const layout = page.getByRole("combobox", {
    name: "Page layout",
    exact: true,
  });
  await layout.focus();
  await expect(layout).toBeFocused();
  const beforeSelectKey = await where(page);
  const beforeLayout = await layout.inputValue();
  await layout.evaluate((element) => {
    document.addEventListener(
      "keydown",
      (event) => {
        element.setAttribute(
          "data-key-prevented",
          String(event.defaultPrevented),
        );
        element.setAttribute(
          "data-key-target",
          String(event.target === element),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.press("ArrowDown");
  await expect(layout).toHaveAttribute("data-key-prevented", "false");
  await expect(layout).toHaveAttribute("data-key-target", "true");
  await settled(page);
  if ((await layout.inputValue()) === beforeLayout) {
    expect(await where(page)).toEqual(beforeSelectKey);
  }
  // ArrowDown alone does not commit a native select option on every platform.
  // Keep the key-ownership assertion above and explicitly choose the layout.
  await layout.selectOption("spread");
  await expect(layout).toHaveValue("spread");
  await expect.poll(() => pageIndexes(page)).not.toEqual([1]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("group", { name: "PDF view controls" }),
  ).toBeHidden();
  const shown = await pageIndexes(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pageIndexes(page)).not.toEqual(shown);
});

test("page keys, modifiers and text fields", async ({ page }) => {
  await openView(page, { defaultZoom: "fitPage", scrollMode: "paged" });
  await settled(page);
  await page.keyboard.press("PageDown");
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
  await page.keyboard.press("PageUp");
  await expect.poll(() => pageIndexes(page)).toEqual([0]);
  // Modified keys belong to VS Code and the extension's shortcuts.
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await settled(page);
  expect(await pageIndexes(page)).toEqual([0]);
  // A text field keeps its arrows.
  const field = page.getByRole("spinbutton").or(page.locator("input")).first();
  await field.focus();
  await page.keyboard.press("ArrowRight");
  await settled(page);
  expect(await pageIndexes(page)).toEqual([0]);
});

test("a long page is read with the arrows and PageDown before the next page turns", async ({
  page,
}) => {
  await openView(page, { defaultZoom: 400, scrollMode: "paged" });
  await settled(page);
  const top = () =>
    page.locator(".viewport").evaluate((viewport) => viewport.scrollTop);
  const start = await top();
  await page.keyboard.press("ArrowDown");
  await expect.poll(top).toBe(start + 40);
  await page.keyboard.press("PageDown");
  await expect.poll(top).toBeGreaterThan(start + 300);
  for (let i = 0; i < 12 && (await pageIndexes(page))[0] === 0; i++) {
    await page.keyboard.press("PageDown");
    await settled(page);
  }
  expect(await pageIndexes(page)).toEqual([1]);
  // The new page starts at its top.
  await expect
    .poll(() =>
      page.locator(".page").evaluate((element) => {
        const viewport = element.closest(".viewport")!.getBoundingClientRect();
        return element.getBoundingClientRect().top - viewport.top;
      }),
    )
    .toBeLessThan(40);
});
