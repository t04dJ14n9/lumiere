import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(tagCount: number): string {
  const tags = Array.from(
    { length: tagCount },
    (_, index) => `  - project-area-${index}-long-label`,
  ).join("\n");
  const body = Array.from(
    { length: 40 },
    (_, index) => `Body paragraph ${index}.`,
  ).join("\n\n");
  return `---\ntags:\n${tags}\n---\n# H1\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; width: 480px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("many wrapping tags keep estimatedHeight near the measured sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await open(page, note(36));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator(".property-chip")).toHaveCount(36);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const measured = view.lineBlockAt(0).height;
    const sheet = document.querySelector(".hybrid-properties") as HTMLElement;
    const drawn = sheet.getBoundingClientRect().height;
    window.harness.reveal(window.harness.text.indexOf("Body paragraph 20"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    view.dispatch({ changes: { from: 4, to: 4, insert: " " } });
    view.dispatch({ changes: { from: 4, to: 5, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      drawn,
      afterRebuild: view.lineBlockAt(0).height,
      chipRows: (() => {
        const chips = [...document.querySelectorAll(".property-chip")];
        // After scroll-away sheet may be gone; use measured drawn before leave.
        return chips.length;
      })(),
    };
  });
  console.log("TAGS_HEIGHT", JSON.stringify(result));
  expect(result.drawn).toBeGreaterThan(200);
  // Rebuild must not collapse toward one control row (~121px estimate today).
  expect(result.afterRebuild).toBeGreaterThan(result.drawn * 0.7);
});
