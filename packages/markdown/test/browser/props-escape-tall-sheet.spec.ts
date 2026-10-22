/**
 * Large-fixture-like sheet (nested maps + tall Sources + trailing map).
 * Host GUI 2026-10-20: Escape while editing a property key scrolled from the
 * sheet top to frontmatter end (sources / decision_confirmation tail).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function largeFixtureLike(sourceCount: number): string {
  const generated = `generated:\n  by: claude-code/claude-opus-5-5\n  at: '2026-10-19T23:30:00+08:00'`;
  const entries = Array.from({ length: sourceCount }, (_, index) => {
    const title =
      index === 0
        ? "DFActivitySystem feat/dfactivitycloud（a66257c，太湖登录与经太湖网关调工蜂）"
        : `Source ${index} long title that wraps in a narrow properties value column`;
    return `  - id: d-src-${index}
    resource: https://git.woa.com/TimiJ3DFMServer/DFActivitySystem/tree/feat/cloud#section-${index}
    revision: a66257c37e8f0f5a8ba4936a028deea681ed293e
    title: ${title}`;
  }).join("\n");
  const decision = `decision_confirmation:
  by: human:youngjin
  at: '2026-09-07T20:09:07+08:00'
  scope: TKEx-IEG IDC 新集群、namespace、CLB、Development 依赖与 BKM/OpenTelemetry`;
  const body = Array.from(
    { length: 30 },
    (_, i) => `Body paragraph ${i} after the sheet.`,
  ).join("\n\n");
  return `---
type: Task
title: Large cold-open fixture
description: Synthetic tall frontmatter fixture for properties layout tests.
tags:
- ai-transformation
- architecture
- external
status: draft
${generated}
sources:
${entries}
${decision}
---
# H1 Title

${body}
`;
}

async function constrain(page: Page, width = 720) {
  await page.setViewportSize({ width, height: 760 });
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("large-fixture-like sheet: decision_confirmation must not overlap sources", async ({
  page,
}) => {
  await open(page, largeFixtureLike(108));
  await constrain(page, 720);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(
    page.locator('[data-property-row="decision_confirmation"]'),
  ).toBeVisible();
  await expect(page.locator('[data-property-row="sources"]')).toBeVisible();

  const geometry = await page.evaluate(async () => {
    const sources = document.querySelector<HTMLElement>(
      '[data-property-row="sources"]',
    )!;
    const decision = document.querySelector<HTMLElement>(
      '[data-property-row="decision_confirmation"]',
    )!;
    const sheet = document.querySelector<HTMLElement>(".hybrid-properties")!;
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    // Let ResizeObserver + requestMeasure catch wrapping Sources.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    await new Promise((r) => setTimeout(r, 50));
    const mapped = view.lineBlockAt(0).height;
    const painted = sheet.getBoundingClientRect().height;
    const s = sources.getBoundingClientRect();
    const d = decision.getBoundingClientRect();
    const firstRaw = sources.querySelector(".source-raw");
    const raw = firstRaw?.getBoundingClientRect();
    return {
      mapped,
      painted,
      sourcesBottom: s.bottom,
      decisionTop: d.top,
      overlap: Math.max(0, s.bottom - d.top),
      rawBottom: raw?.bottom ?? null,
      decisionContainsRaw: !!firstRaw && decision.contains(firstRaw),
      decisionHtmlSnippet: decision
        .querySelector(".metadata-property-value")
        ?.innerHTML.slice(0, 280),
    };
  });

  expect(geometry, JSON.stringify(geometry)).toMatchObject({
    decisionContainsRaw: false,
  });
  expect(geometry.overlap, JSON.stringify(geometry)).toBe(0);
  expect(geometry.decisionTop, JSON.stringify(geometry)).toBeGreaterThanOrEqual(
    geometry.sourcesBottom - 1,
  );
  // Mapped height must track painted sheet (Escape scrollIntoView uses the map).
  expect(geometry.mapped, JSON.stringify(geometry)).toBeGreaterThan(
    geometry.painted * 0.85,
  );
});

test("Escape on property key does not jump scroll into the sources/decision overlap", async ({
  page,
}) => {
  await open(page, largeFixtureLike(108));
  await constrain(page, 720);
  await expect(page.locator(".hybrid-properties")).toBeVisible();

  // Focus a key near the top (title).
  const titleKey = page.locator(
    '[data-property-row="title"] [data-property-name]',
  );
  await titleKey.click();
  await titleKey.press("Escape");

  const after = await page.evaluate(() => {
    const view = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    )!.context!.editor.view;
    const scroller = view.scrollDOM;
    const decision = document.querySelector(
      '[data-property-row="decision_confirmation"]',
    );
    const sources = document.querySelector('[data-property-row="sources"]');
    return {
      scrollTop: scroller.scrollTop,
      decisionInDom: !!decision,
      sourcesInDom: !!sources,
      // After Escape, frontmatter end should be near the top of the viewport,
      // not scrolled so far that only the sheet tail is visible.
      headingVisible: !!document.evaluate(
        "//*[contains(text(),'H1 Title')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue,
    };
  });

  // Primary assertion: we should not land scrolled deep into the sheet tail.
  // scrollTop near 0 means we stayed at the top; a huge jump is the host bug.
  expect(after.scrollTop, JSON.stringify(after)).toBeLessThan(200);
});

test("sheet mapped height tracks painted with wrapping large-fixture source titles", async ({
  page,
}) => {
  await open(page, largeFixtureLike(108));
  await constrain(page, 480); // narrow → more wrap
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const sheet = document.querySelector<HTMLElement>(".hybrid-properties")!;
    return {
      mapped: view.lineBlockAt(0).height,
      painted: sheet.getBoundingClientRect().height,
    };
  });
  expect(result.mapped, JSON.stringify(result)).toBeGreaterThan(
    result.painted * 0.9,
  );
  expect(result.painted, JSON.stringify(result)).toBeGreaterThan(
    result.mapped * 0.9,
  );
});
