import { test, expect } from "@playwright/test";
import { open } from "./harness";

function codeBlockNote({
  before = 80,
  code = 220,
  after = 80,
}: {
  before?: number;
  code?: number;
  after?: number;
} = {}): string {
  const prose = (label: string, count: number) =>
    Array.from(
      { length: count },
      (_unused, index) =>
        `${label} ${String(index + 1).padStart(3, "0")} ${"p".repeat(56)}`,
    );
  const source = Array.from(
    { length: code },
    (_unused, index) =>
      `const value_${String(index + 1).padStart(3, "0")} = ${index + 1};`,
  );
  return (
    [
      ...prose("before", before),
      "```ts",
      ...source,
      "```",
      ...prose("after", after),
      "",
    ].join("\n") + "\n"
  );
}

test("dragging upward inside a code block keeps scroll stable while the pointer stays in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const source = codeBlockNote();
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });

  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
    }
  });
  await page.waitForTimeout(80);

  const lines = source.split("\n");
  const offset = (lineNumber: number, column = 0) =>
    lines
      .slice(0, lineNumber - 1)
      .reduce((sum, line) => sum + line.length + 1, 0) + column;
  const codeLine = 80 + 2 + Math.floor(220 * 0.65);
  await page.evaluate(
    (at) => window.harness.reveal(at),
    offset(codeLine, "const value_".length + 10),
  );
  await page.waitForTimeout(120);

  const before = await page.evaluate(() => {
    const cm = document.querySelector<HTMLElement>(".cm-scroller");
    const app = document.querySelector<HTMLElement>("#app");
    if (!cm || !app) {
      throw new Error("Missing scroll containers");
    }
    const scroller = cm;
    const viewport = scroller.getBoundingClientRect();
    const lines = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
    ].filter(
      (line) =>
        line.textContent?.startsWith("const value_") &&
        line.getBoundingClientRect().top >= viewport.top + 28 &&
        line.getBoundingClientRect().bottom <= viewport.bottom - 28,
    );
    if (lines.length < 10) {
      throw new Error("Not enough visible code lines");
    }
    const from = lines[Math.floor(lines.length * 0.8)]!.getBoundingClientRect();
    const to = lines[Math.floor(lines.length * 0.2)]!.getBoundingClientRect();
    const range = (node: HTMLElement) =>
      Math.max(0, node.scrollHeight - node.clientHeight);
    return {
      points: {
        from: { x: from.left + 30, y: (from.top + from.bottom) / 2 },
        to: { x: to.left + 30, y: (to.top + to.bottom) / 2 },
      },
      cm: {
        top: cm.scrollTop,
        range: range(cm),
      },
      app: {
        top: app.scrollTop,
        range: range(app),
      },
    };
  });

  const selectionBefore = await page.evaluate(() => {
    const view = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    return {
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
    };
  });

  await page.mouse.move(before.points.from.x, before.points.from.y);
  await page.mouse.down();
  await page.mouse.move(before.points.to.x, before.points.to.y, { steps: 14 });
  await page.waitForTimeout(120);

  const during = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    const app = document.querySelector<HTMLElement>("#app");
    const view = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    if (!scroller || !app) {
      throw new Error("Missing scroll containers");
    }
    const range = (node: HTMLElement) =>
      Math.max(0, node.scrollHeight - node.clientHeight);
    return {
      cm: {
        top: scroller.scrollTop,
        range: range(scroller),
      },
      app: {
        top: app.scrollTop,
        range: range(app),
      },
      selection: {
        from: view.state.selection.main.from,
        to: view.state.selection.main.to,
      },
    };
  });

  await page.mouse.up();

  expect(during.selection.to - during.selection.from).toBeGreaterThan(0);
  expect(during.selection.from).not.toBe(selectionBefore.from);
  expect(before.cm.range + before.app.range).toBeGreaterThan(0);
  if (before.cm.range > 0) {
    expect(Math.abs(during.cm.top - before.cm.top)).toBeLessThanOrEqual(2);
  }
  if (before.app.range > 0) {
    expect(Math.abs(during.app.top - before.app.top)).toBeLessThanOrEqual(2);
  }
});

test("dragging from a fenced code line upward into prose keeps scroll stable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const source = codeBlockNote({ before: 90, code: 220, after: 60 });
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
    }
  });

  const lines = source.split("\n");
  const offset = (lineNumber: number, column = 0) =>
    lines
      .slice(0, lineNumber - 1)
      .reduce((sum, line) => sum + line.length + 1, 0) + column;
  const firstCodeLine = 90 + 2;
  await page.evaluate(
    (at) => window.harness.reveal(at),
    offset(firstCodeLine + 6, 16),
  );
  await page.waitForTimeout(120);

  const before = await page.evaluate(() => {
    const cm = document.querySelector<HTMLElement>(".cm-scroller");
    const app = document.querySelector<HTMLElement>("#app");
    if (!cm || !app) {
      throw new Error("Missing scroll containers");
    }
    const viewport = cm.getBoundingClientRect();
    const boxes = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
    ].map((line) => ({
      line,
      text: line.textContent ?? "",
      box: line.getBoundingClientRect(),
    }));
    const code = boxes.find(
      ({ text, box }) =>
        text.startsWith("const value_") &&
        box.top >= viewport.top + 56 &&
        box.bottom <= viewport.bottom - 56,
    );
    const prose = [...boxes]
      .reverse()
      .find(
        ({ text, box }) =>
          text.startsWith("before ") &&
          box.top >= viewport.top + 24 &&
          box.bottom <= viewport.bottom - 24,
      );
    if (!code || !prose) {
      throw new Error("Missing visible drag endpoints");
    }
    const range = (node: HTMLElement) =>
      Math.max(0, node.scrollHeight - node.clientHeight);
    return {
      points: {
        from: {
          x: code.box.left + 40,
          y: (code.box.top + code.box.bottom) / 2,
        },
        to: {
          x: prose.box.left + 40,
          y: (prose.box.top + prose.box.bottom) / 2,
        },
      },
      cm: { top: cm.scrollTop, range: range(cm) },
      app: { top: app.scrollTop, range: range(app) },
    };
  });

  await page.mouse.move(before.points.from.x, before.points.from.y);
  await page.mouse.down();
  await page.mouse.move(before.points.to.x, before.points.to.y, { steps: 14 });
  await page.waitForTimeout(120);

  const during = await page.evaluate(() => {
    const cm = document.querySelector<HTMLElement>(".cm-scroller");
    const app = document.querySelector<HTMLElement>("#app");
    const view = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    if (!cm || !app) {
      throw new Error("Missing scroll containers");
    }
    const range = (node: HTMLElement) =>
      Math.max(0, node.scrollHeight - node.clientHeight);
    return {
      cm: { top: cm.scrollTop, range: range(cm) },
      app: { top: app.scrollTop, range: range(app) },
      selection: {
        from: view.state.selection.main.from,
        to: view.state.selection.main.to,
      },
    };
  });

  await page.mouse.up();

  expect(during.selection.to - during.selection.from).toBeGreaterThan(0);
  if (before.cm.range > 0) {
    expect(Math.abs(during.cm.top - before.cm.top)).toBeLessThanOrEqual(2);
  }
  if (before.app.range > 0) {
    expect(Math.abs(during.app.top - before.app.top)).toBeLessThanOrEqual(2);
  }
});

test("dragging upward from a rendered mermaid code block does not jump the editor upward", async ({
  page,
}) => {
  const source = [
    ...Array.from({ length: 40 }, (_, index) => `before ${index + 1}`),
    "```mermaid",
    "graph TD",
    ...Array.from(
      { length: 70 },
      (_, index) => `  N${index} --> N${index + 1}`,
    ),
    "```",
    ...Array.from({ length: 60 }, (_, index) => `after ${index + 1}`),
    "",
  ].join("\n");
  await page.setViewportSize({ width: 920, height: 720 });
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
    }
  });
  const diagram = page.locator(".hybrid-diagram").first();
  await expect(diagram).toBeVisible();

  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    const block = document.querySelector<HTMLElement>(".hybrid-diagram");
    if (!scroller || !block) {
      throw new Error("Missing diagram block");
    }
    // Place the viewport so the diagram is visible but its start is above view.
    scroller.scrollTop =
      block.offsetTop + Math.max(0, block.clientHeight * 0.85) - 220;
  });
  await page.waitForTimeout(120);

  const drag = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    const block = document.querySelector<HTMLElement>(".hybrid-diagram");
    if (!scroller || !block) {
      throw new Error("Missing diagram block");
    }
    const viewport = scroller.getBoundingClientRect();
    const box = block.getBoundingClientRect();
    if (box.top >= viewport.top + 4) {
      throw new Error(
        "Diagram top is fully visible; jump probe is inconclusive",
      );
    }
    return {
      scrollTop: scroller.scrollTop,
      from: { x: box.left + 80, y: box.top + box.height * 0.72 },
      to: {
        x: box.left + 80,
        y: Math.max(viewport.top + 36, box.top + box.height * 0.58),
      },
    };
  });

  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.waitForTimeout(40);

  const afterDown = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    return scroller.scrollTop;
  });

  await page.mouse.move(drag.to.x, drag.to.y, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();

  expect(Math.abs(afterDown - drag.scrollTop)).toBeLessThanOrEqual(2);
});

test("dragging an existing fenced-code selection upward keeps scroll stable", async ({
  page,
}) => {
  const beforeCount = 90;
  const codeCount = 220;
  const source = codeBlockNote({
    before: beforeCount,
    code: codeCount,
    after: 60,
  });
  await page.setViewportSize({ width: 920, height: 720 });
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
    }
  });
  const lines = source.split("\n");
  const offset = (lineNumber: number, column = 0) =>
    lines
      .slice(0, lineNumber - 1)
      .reduce((sum, line) => sum + line.length + 1, 0) + column;
  const codeStartLine = beforeCount + 2;
  const anchorLine = codeStartLine + Math.floor(codeCount * 0.62);
  const headLine = anchorLine + 12;
  await page.evaluate(
    ({ anchor, head }) => window.harness.reveal(anchor, head),
    {
      anchor: offset(anchorLine, 8),
      head: offset(headLine, 18),
    },
  );
  await page.waitForTimeout(120);

  const probe = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    const viewport = scroller.getBoundingClientRect();
    const selected = [
      ...document.querySelectorAll<HTMLElement>(
        ".mw-selection-layer .cm-selectionBackground",
      ),
    ]
      .map((node) => node.getBoundingClientRect())
      .filter(
        (box) =>
          box.top >= viewport.top + 24 && box.bottom <= viewport.bottom - 24,
      )
      .sort((a, b) => a.top - b.top);
    if (selected.length < 4) {
      throw new Error("Selection probe markers are insufficient");
    }
    const middle = selected[Math.floor(selected.length * 0.5)]!;
    const upper = selected[Math.floor(selected.length * 0.18)]!;
    return {
      scrollTop: scroller.scrollTop,
      from: {
        x: middle.left + Math.min(40, (middle.right - middle.left) / 2),
        y: (middle.top + middle.bottom) / 2,
      },
      to: {
        x: upper.left + Math.min(30, (upper.right - upper.left) / 2),
        y: (upper.top + upper.bottom) / 2,
      },
    };
  });

  await page.mouse.move(probe.from.x, probe.from.y);
  await page.mouse.down();
  await page.mouse.move(probe.to.x, probe.to.y, { steps: 10 });
  await page.waitForTimeout(120);

  const during = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    const selection = document.getSelection()?.toString() ?? "";
    return { top: scroller.scrollTop, selectionLength: selection.length };
  });

  await page.mouse.up();

  expect(during.selectionLength).toBeGreaterThan(0);
  expect(Math.abs(during.top - probe.scrollTop)).toBeLessThanOrEqual(2);
});

test("dragging upward near the top edge inside the viewport does not auto-scroll", async ({
  page,
}) => {
  const source = codeBlockNote({ before: 90, code: 220, after: 60 });
  await page.setViewportSize({ width: 920, height: 720 });
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
    }
  });
  const lines = source.split("\n");
  const offset = (lineNumber: number, column = 0) =>
    lines
      .slice(0, lineNumber - 1)
      .reduce((sum, line) => sum + line.length + 1, 0) + column;
  await page.evaluate(
    (at) => window.harness.reveal(at),
    offset(90 + 2 + Math.floor(220 * 0.7), 14),
  );
  await page.waitForTimeout(120);

  const drag = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    const viewport = scroller.getBoundingClientRect();
    const lines = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
    ].filter((line) => line.textContent?.startsWith("const value_"));
    if (lines.length < 10) {
      throw new Error("Not enough visible code lines");
    }
    const from = lines[Math.floor(lines.length * 0.8)]!.getBoundingClientRect();
    return {
      top: scroller.scrollTop,
      from: { x: from.left + 40, y: (from.top + from.bottom) / 2 },
      nearTop: { x: from.left + 40, y: viewport.top + 8 },
    };
  });

  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.mouse.move(drag.nearTop.x, drag.nearTop.y, { steps: 12 });
  await page.waitForTimeout(1000);
  const during = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    return scroller.scrollTop;
  });
  await page.mouse.up();

  expect(Math.abs(during - drag.top)).toBeLessThanOrEqual(2);
});

test("scrollIntoView requests during an active pointer drag do not move the viewport", async ({
  page,
}) => {
  const source = codeBlockNote({ before: 90, code: 220, after: 60 });
  await page.setViewportSize({ width: 920, height: 720 });
  await open(page, source);
  await page.addStyleTag({
    content:
      "html, body, #app { height: 100%; margin: 0; } #app { overflow: auto; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.height = "520px";
      scroller.style.overflow = "auto";
      scroller.scrollTop =
        (scroller.scrollHeight - scroller.clientHeight) * 0.6;
    }
  });
  await page.waitForTimeout(100);

  const start = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    const viewport = scroller.getBoundingClientRect();
    const line = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
    ].find(
      (item) =>
        item.textContent?.startsWith("const value_") &&
        item.getBoundingClientRect().top >= viewport.top + 56 &&
        item.getBoundingClientRect().bottom <= viewport.bottom - 56,
    );
    if (!line) {
      throw new Error("No visible code line to start drag");
    }
    const box = line.getBoundingClientRect();
    return {
      range: scroller.scrollHeight - scroller.clientHeight,
      x: box.left + 40,
      y: (box.top + box.bottom) / 2,
    };
  });

  expect(start.range).toBeGreaterThan(0);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  const displacement = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) {
      throw new Error("Missing editor scroller");
    }
    const before = scroller.scrollTop;
    const view = [...window.harness.views[0]!.runtime.fibers].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
    return scroller.scrollTop - before;
  });
  await page.mouse.up();

  expect(Math.abs(displacement)).toBeLessThanOrEqual(2);
});
