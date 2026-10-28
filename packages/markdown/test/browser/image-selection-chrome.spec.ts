/**
 * Host GUI BH-007: selecting a `|200` image must not leave a tall caret /
 * empty shell band below the card. The paint reserve (estimatedHeight) is
 * released after measure, and the caret is hidden while the image is selected.
 */
import { expect, test } from "@playwright/test";
import { open } from "./harness";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALUlEQVR4nO3NMQkAAAwDsPo3vSkolED+5JKKzioWi8VisVgsFovFYrFYLB6NH6r1OhvW1o1iAAAAAElFTkSuQmCC";

test("selected |200 image has no caret bar below the card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await open(
    page,
    `# Embeds\n\nAn image by wikilink, with a width:\n\n![Fixture|200](${PNG})\n\nafter\n`,
  );
  const img = page.locator("img.note-image").first();
  await expect(img).toBeVisible({ timeout: 10000 });
  // Allow load → measure → minHeight release.
  await expect
    .poll(async () =>
      img.evaluate((el) => {
        const shell = el.closest(".hybrid-block") as HTMLElement | null;
        return shell?.style.minHeight ?? "";
      }),
    )
    .toBe("");
  await img.click();
  await expect(img).toHaveClass(/md-image-selected/);
  const info = await page.evaluate(() => {
    const image = document.querySelector("img.note-image")!;
    const shell = image.closest(".hybrid-block") as HTMLElement;
    const editor = document.querySelector(".cm-editor") as HTMLElement;
    const caret = document.querySelector(".mw-caret") as HTMLElement | null;
    const imgBox = image.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    const style = caret
      ? getComputedStyle(caret.closest(".mw-caret-layer")!).visibility
      : "missing";
    return {
      selectedAttr: editor.hasAttribute("data-mw-image-selected"),
      minHeight: shell.style.minHeight,
      imgH: imgBox.height,
      shellH: shellBox.height,
      caretVisible: style,
    };
  });
  expect(info.selectedAttr).toBe(true);
  expect(info.minHeight).toBe("");
  // Shell no longer keeps the |W| estimatedHeight reserve under the card.
  expect(info.shellH).toBeLessThanOrEqual(info.imgH + 8);
  // Caret layer hidden while selected (geometry may still exist).
  expect(info.caretVisible).toBe("hidden");
});

test("images (standalone and inside tables) and Mermaid diagrams open in larger window on button click or double-click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 750 });
  const doc = [
    "# Media Lightbox",
    "",
    `![Standalone|160](${PNG})`,
    "",
    `- List item with inline image ![InlineImage](${PNG})`,
    "",
    "| Col A | Col B |",
    "| --- | --- |",
    `| cell | ![TableImage](${PNG}) |`,
    "",
    "```mermaid",
    "flowchart LR",
    "  A[Start] --> B[End]",
    "```",
    "",
    "Tail paragraph",
  ].join("\n");
  await open(page, doc);

  const standaloneImg = page.locator("img.note-image").first();
  await expect(standaloneImg).toBeVisible({ timeout: 10_000 });
  await standaloneImg.dblclick();
  const dialog = page.locator("dialog.image-inspector[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".media-area img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const inlineImg = page.locator('img[alt="InlineImage"]');
  await expect(inlineImg).toBeVisible();
  await inlineImg.click();
  await expect(inlineImg).toHaveClass(/md-image-selected/);
  const lineHasEmbedClass = await inlineImg.evaluate(
    (el) => el.closest(".cm-line")?.classList.contains("image-embed") ?? false,
  );
  expect(lineHasEmbedClass).toBe(false);
  await inlineImg.dblclick();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const tableImg = page.locator(".cm-table-widget img").first();
  await expect(tableImg).toBeVisible();
  await tableImg.dblclick();
  await expect(dialog).toBeVisible();
  await dialog.locator('button[aria-label="Close image"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(tableImg).toBeVisible();

  const mermaidSvg = page.locator('pre[data-fence="mermaid"] svg');
  await expect(mermaidSvg).toBeVisible({ timeout: 15_000 });
  const inspectDiagramBtn = page.locator("button.inspect-diagram");
  await expect(inspectDiagramBtn).toHaveCount(1);
  await inspectDiagramBtn.dispatchEvent("click");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".media-area svg")).toBeVisible();
  await dialog.locator('button[aria-label="Zoom in"]').click();
  await dialog.locator('button[aria-label="Close diagram"]').click();
  await expect(dialog).toHaveCount(0);
});
