import { expect, test, type Page } from "@playwright/test";
import {
  open,
  pagePoint,
  selectText,
  drag,
  TEXT_MIDLINE,
} from "./viewer-support";

const THEMES = {
  "Light Modern": {
    "editor-selectionBackground": "#ADD6FF",
    "textLink-foreground": "#005FB8",
    focusBorder: "#005FB8",
  },
  "Dark Modern": {
    "editor-selectionBackground": "#264F78",
    "textLink-foreground": "#4daafc",
    focusBorder: "#0078D4",
  },
  "Dark High Contrast": {
    "editor-selectionBackground": "#f3f518",
    "textLink-foreground": "#21A6FF",
    focusBorder: "#F38518",
  },
  "Light High Contrast": {
    "editor-selectionBackground": "#0F4A85",
    "textLink-foreground": "#0F4A85",
    focusBorder: "#006BBD",
  },
  "Cursor Light": {
    "editor-selectionBackground": "rgba(20, 20, 20, 0.08)",
    "textLink-foreground": "#0064B0",
    focusBorder: "rgba(20, 20, 20, 0.2)",
  },
  "Cursor Dark": {
    "editor-selectionBackground": "rgba(64, 64, 64, 0.6)",
    "textLink-foreground": "#81A1C1",
    focusBorder: "rgba(240, 240, 240, 0.15)",
  },
};

async function useTheme(
  page: Page,
  colours: Record<string, string>,
): Promise<void> {
  await page.evaluate((colours) => {
    for (const [name, value] of Object.entries(colours)) {
      document.documentElement.style.setProperty(`--vscode-${name}`, value);
    }
  }, colours);
}

/**
 * How a colour on `element` stands out from the white page beneath it: the
 * WCAG contrast ratio between white and the colour painted over white.
 */
function contrastOnPaper(
  page: Page,
  selector: string,
  property: "backgroundColor" | "borderTopColor",
): Promise<number> {
  return page.evaluate(
    ([selector, property]) => {
      const colour = getComputedStyle(document.querySelector(selector)!)[
        property
      ];
      const context = Object.assign(document.createElement("canvas"), {
        width: 1,
        height: 1,
      }).getContext("2d")!;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const channels = [
        ...context.getImageData(0, 0, 1, 1).data.slice(0, 3),
      ].map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      const luminance =
        0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
      return 1.05 / (luminance + 0.05);
    },
    [selector, property] as const,
  );
}

test("selections and flashed boxes stand out on the page in every theme", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  const fills: Record<string, number> = {};
  for (const [name, colours] of Object.entries(THEMES)) {
    await useTheme(page, colours);
    fills[name] = await contrastOnPaper(
      page,
      '[style*="selection-fill"]',
      "backgroundColor",
    );
  }

  await page.keyboard.press("Escape");
  await drag(page, at(150, 150), at(250, 250));
  await expect(page.locator(".region-selection")).toBeVisible();
  const regions: Record<string, number[]> = {};
  for (const [name, colours] of Object.entries(THEMES)) {
    await useTheme(page, colours);
    regions[name] = [
      await contrastOnPaper(page, ".region-selection", "backgroundColor"),
      await contrastOnPaper(page, ".region-selection", "borderTopColor"),
    ];
  }

  await page.evaluate(() =>
    (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
      type: "goTo",
      location: {
        page: 1,
        viewRect: { left: 72, top: 83, width: 134, height: 21 },
      },
    }),
  );
  await expect(page.locator(".location-highlight")).toBeVisible();
  const flashes: Record<string, number> = {};
  for (const [name, colours] of Object.entries(THEMES)) {
    await useTheme(page, colours);
    flashes[name] = await contrastOnPaper(
      page,
      ".location-highlight",
      "borderTopColor",
    );
  }

  for (const name of Object.keys(THEMES)) {
    // A highlight under text: clearly tinted, yet light enough to read through.
    expect(fills[name], `${name} text selection`).toBeGreaterThan(1.3);
    expect(regions[name]![0], `${name} region fill`).toBeGreaterThan(1.1);
    // Outlines: WCAG's 3:1 for graphical objects.
    expect(regions[name]![1], `${name} region border`).toBeGreaterThanOrEqual(
      3,
    );
    expect(flashes[name], `${name} location border`).toBeGreaterThanOrEqual(3);
  }
});
