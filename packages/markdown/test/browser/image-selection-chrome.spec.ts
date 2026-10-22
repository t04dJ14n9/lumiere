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
