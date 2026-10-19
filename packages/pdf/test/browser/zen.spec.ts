import { expect, test, type Page } from "@playwright/test";
import { messages, open } from "./viewer-support";

const hostSend = (page: Page, message: unknown) =>
  page.evaluate(
    (message) =>
      (window as unknown as { hostSend: (message: unknown) => void }).hostSend(
        message,
      ),
    message,
  );

const bar = (page: Page) => page.getByRole("toolbar", { name: "PDF toolbar" });

for (const mode of ["chrome", "slim"]) {
  test(`${mode} toolbar: zen shows the floating bar with Exit zen, and the mode comes back after`, async ({
    page,
  }) => {
    await open(page, `?toolbar=${mode}`);
    await expect(page.locator(".viewer")).toHaveClass(
      new RegExp(`toolbar-${mode}`),
    );
    await hostSend(page, { type: "zen", on: true });
    await expect(page.locator(".viewer")).toHaveClass(/toolbar-floating/);
    await expect(bar(page)).toHaveAttribute("aria-orientation", "horizontal");
    await expect(
      bar(page).getByRole("button", { name: "Exit zen mode" }),
    ).toBeVisible();
    // Never a setting: the host's toolbar mode is untouched, and a reload keeps zen.
    await hostSend(page, { type: "toolbar", toolbar: { mode } });
    await expect(page.locator(".viewer")).toHaveClass(/toolbar-floating/);
    await hostSend(page, { type: "zen", on: false });
    await expect(page.locator(".viewer")).toHaveClass(
      new RegExp(`toolbar-${mode}`),
    );
    await expect(
      bar(page).getByRole("button", { name: "Exit zen mode" }),
    ).toHaveCount(0);
  });
}

test("the Exit zen button asks the extension to exit zen", async ({ page }) => {
  await open(page, "?toolbar=chrome");
  await hostSend(page, { type: "zen", on: true });
  await bar(page).getByRole("button", { name: "Exit zen mode" }).click();
  expect(
    (await messages(page)).filter((message) => message.type === "zen"),
  ).toEqual([{ type: "zen", exit: true }]);
});

test("floating stays floating (with Exit zen) and none stays none in zen", async ({
  page,
}) => {
  await open(page, "?toolbar=floating&dock=left");
  await hostSend(page, { type: "zen", on: true });
  await expect(bar(page)).toHaveAttribute("aria-orientation", "vertical");
  await expect(
    bar(page).getByRole("button", { name: "Exit zen mode" }),
  ).toBeVisible();
  await hostSend(page, { type: "toolbar", toolbar: { mode: "none" } });
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator(".viewer")).toHaveClass(/toolbar-none/);
});

test("the viewer tells the extension when full-screen zen ends without it", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  // The window is the size of the screen while zen is on, then smaller.
  await page.evaluate(() => {
    Object.defineProperty(window, "outerWidth", {
      value: screen.width,
      configurable: true,
    });
    Object.defineProperty(window, "outerHeight", {
      value: screen.height,
      configurable: true,
    });
  });
  await hostSend(page, { type: "zen", on: true });
  await expect(page.locator(".viewer")).toHaveClass(/toolbar-floating/);
  expect(
    (await messages(page)).filter((message) => message.type === "zen"),
  ).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(window, "outerWidth", {
      value: screen.width - 300,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".viewer")).toHaveClass(/toolbar-chrome/);
  expect(
    (await messages(page)).filter((message) => message.type === "zen"),
  ).toEqual([{ type: "zen", exit: false }]);
});
