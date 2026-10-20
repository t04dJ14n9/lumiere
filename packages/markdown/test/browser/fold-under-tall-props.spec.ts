/**
 * Fold gutter under a tall Sources sheet: the fold arrow on a heading row
 * must fold that section. Height-map drift from an unestimated properties
 * sheet (#100) leaves the arrow away from the heading; with the reserve the
 * click lands and folds.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(sourceCount: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, i) => `  - title: S${i}\n    resource: https://ex.com/${i}`,
  ).join("\n");
  const body = Array.from(
    { length: 20 },
    (_, i) => `Body paragraph ${i} under the fold target.`,
  ).join("\n\n");
  return `---\nsources:\n${entries}\n---\n# Fold Target\n\n${body}\n\n# After Fold\n\nTail paragraph.\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("fold gutter under tall Sources folds the heading section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(28));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();

  const scrolled = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const at = window.harness.text.indexOf("# Fold Target");
    const block = view.lineBlockAt(at);
    const scroller = document.querySelector(".cm-scroller") as HTMLElement;
    scroller.scrollTop = Math.max(0, block.top - 40);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const heading = [...document.querySelectorAll(".cm-line")].find((line) =>
      (line.textContent ?? "").includes("Fold Target"),
    );
    return {
      propsHeight: view.lineBlockAt(0).height,
      headingVisible: !!heading,
      scrollTop: scroller.scrollTop,
    };
  });

  expect(scrolled.propsHeight, JSON.stringify(scrolled)).toBeGreaterThan(200);
  expect(scrolled.headingVisible, JSON.stringify(scrolled)).toBe(true);

  const clicked = await page.evaluate(async () => {
    const heading = [...document.querySelectorAll(".cm-line")].find((line) =>
      (line.textContent ?? "").includes("Fold Target"),
    ) as HTMLElement | undefined;
    if (!heading) {
      return { ok: false as const, reason: "no-heading" };
    }
    const row = heading.getBoundingClientRect();
    const midY = row.top + row.height / 2;
    const arrow = [
      ...document.querySelectorAll(".cm-foldGutter .cm-gutterElement"),
    ]
      .map((el) => ({ el: el as HTMLElement, box: el.getBoundingClientRect() }))
      .find(
        ({ box }) =>
          box.height > 0 &&
          box.width > 0 &&
          midY >= box.top - 2 &&
          midY <= box.bottom + 2,
      );
    if (!arrow) {
      return { ok: false as const, reason: "no-arrow", midY, rowTop: row.top };
    }
    const span = arrow.el.querySelector("span") ?? arrow.el;
    span.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    span.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
    );
    span.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const folded = !!document.querySelector(
      ".cm-foldPlaceholder, .cm-foldGutter [title*='Unfold'], .mw-folded",
    );
    const bodyVisible = /Body paragraph 0/.test(
      document.querySelector(".cm-content")?.textContent ?? "",
    );
    return { ok: true as const, folded, bodyVisible };
  });

  expect(clicked, JSON.stringify(clicked)).toMatchObject({ ok: true });
  if (clicked.ok) {
    expect(clicked.folded, JSON.stringify(clicked)).toBe(true);
    expect(clicked.bodyVisible, JSON.stringify(clicked)).toBe(false);
  }
});
