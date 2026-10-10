import { expect, test } from "@playwright/test";
import { open, messages, lastView, sendAction } from "./viewer-support";

test("with the controls in VS Code's own UI the viewer has no toolbar; the setting switches it live", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  await expect(page.getByRole("toolbar", { name: "PDF toolbar" })).toHaveCount(
    0,
  );
  // The pages take the whole height.
  const viewport = (await page.locator(".viewport").boundingBox())!;
  expect(viewport.y).toBe(0);
  expect(viewport.height).toBe(page.viewportSize()!.height);
  // Find still opens in the viewer.
  await sendAction(page, { action: "find" });
  await expect(
    page.getByRole("searchbox", { name: "Find in PDF" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");

  const setToolbar = (mode: string) =>
    page.evaluate(
      (mode) =>
        (
          window as unknown as { hostSend: (message: unknown) => void }
        ).hostSend({ type: "toolbar", toolbar: { mode } }),
      mode,
    );
  await setToolbar("slim");
  await expect(
    page.getByRole("toolbar", { name: "PDF toolbar" }),
  ).toContainText("of 12");
  await setToolbar("none");
  await expect(page.getByRole("toolbar", { name: "PDF toolbar" })).toHaveCount(
    0,
  );
  // An unknown mode is the default one.
  await setToolbar("sideways");
  await expect(page.locator(".viewer")).toHaveClass(/toolbar-chrome/);

  // A reloaded file keeps the latest setting.
  await setToolbar("slim");
  await page.evaluate(async () => {
    document.querySelector(".viewer")!.classList.add("before-reload");
    const data = await (await fetch("/fixtures/outline.pdf")).arrayBuffer();
    (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
      type: "load",
      data,
    });
  });
  await expect(
    page.locator('.viewer:not(.before-reload) .page[data-page-index="0"] img'),
  ).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "PDF toolbar" }),
  ).toBeVisible();
});

test("the slim bar's buttons page, fit, pick the tool and toggle the outline, and show which fit and tool are on", async ({
  page,
}) => {
  await open(page);
  const toolbar = page.getByRole("toolbar", { name: "PDF toolbar" });
  const button = (name: string) =>
    toolbar.getByRole("button", { name, exact: true });
  await expect(button("Fit width")).toHaveAttribute("aria-pressed", "true");
  await expect(button("Fit page")).toHaveAttribute("aria-pressed", "false");
  await expect(button("Select text")).toHaveAttribute("aria-pressed", "true");
  await expect(button("Previous page")).toBeDisabled();
  // Tooltips carry the shortcut.
  await expect(button("Zoom in")).toHaveAttribute(
    "title",
    /^Zoom in \((Ctrl\+=|⌘=)\)$/u,
  );

  await button("Next page").click();
  await button("Next page").click();
  await expect(toolbar.getByRole("textbox", { name: "Page" })).toHaveValue("3");
  await button("Previous page").click();
  await expect.poll(() => lastView(page)).toMatchObject({ page: 2 });

  await button("Fit page").click();
  await expect(button("Fit page")).toHaveAttribute("aria-pressed", "true");
  await expect(button("Fit width")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "page" });
  await button("Zoom out").click();
  await expect(button("Fit page")).toHaveAttribute("aria-pressed", "false");

  await button("Select region").click();
  await expect(button("Select region")).toHaveAttribute("aria-pressed", "true");
  await expect(button("Select text")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "region" });
  await button("Select text").click();
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });

  await button("Toggle outline").click();
  await expect
    .poll(async () =>
      (await messages(page)).filter(
        (message) => message.type === "toggleOutline",
      ),
    )
    .toHaveLength(1);
  await button("Find in PDF").click();
  await expect(
    page.getByRole("searchbox", { name: "Find in PDF" }),
  ).toBeFocused();
});

test("the toolbar and search bar icons are the codicon font, loaded from the extension", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Find in PDF" }).click();
  // `load` resolves with the faces it loaded: none if the font were missing.
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await document.fonts.load("16px codicon")).map((face) => face.status),
      ),
    )
    .toEqual(["loaded"]);
  // Each icon is drawn: a glyph of the icon font, not an empty box.
  const icon = page
    .getByRole("button", { name: "Close search" })
    .locator(".codicon");
  const box = (await icon.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(14);
  expect(
    await icon.evaluate(
      (element) => getComputedStyle(element, "::before").content,
    ),
  ).not.toBe("none");
});
