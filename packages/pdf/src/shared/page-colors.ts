/**
 * PDF page colors (setting `lumiere.pdf.pageColors`): Follow the editor
 * theme kind, or force Normal (white paper) / Dark (dark paper + recolored
 * text and vectors). Images stay as-is under Dark; see EmbedPDF #679.
 */

export type PageColorsSetting = "follow" | "normal" | "dark";
export type EffectivePageColors = "normal" | "dark";

export const PAGE_COLORS_SETTINGS: readonly PageColorsSetting[] = [
  "follow",
  "normal",
  "dark",
];
export const DEFAULT_PAGE_COLORS: PageColorsSetting = "follow";

/**
 * VS Code `ColorThemeKind` numeric values (shared has no `vscode` import):
 * Light=1, Dark=2, HighContrast=3, HighContrastLight=4.
 */
export type ThemeKind = 1 | 2 | 3 | 4;

export function parsePageColors(value: unknown): PageColorsSetting {
  return PAGE_COLORS_SETTINGS.includes(value as PageColorsSetting)
    ? (value as PageColorsSetting)
    : DEFAULT_PAGE_COLORS;
}

/**
 * Stored setting plus (when Follow) theme kind → effective render mode.
 * Dark and High Contrast → dark; Light and High Contrast Light → normal.
 */
export function resolveEffective(
  pageColors: PageColorsSetting,
  kind: ThemeKind,
): EffectivePageColors {
  if (pageColors === "normal" || pageColors === "dark") {
    return pageColors;
  }
  return kind === 2 || kind === 3 ? "dark" : "normal";
}

/** Status-bar / command cycle: Follow → Normal → Dark → Follow. */
export function cyclePageColors(current: PageColorsSetting): PageColorsSetting {
  const index = PAGE_COLORS_SETTINGS.indexOf(current);
  return PAGE_COLORS_SETTINGS[(index + 1) % PAGE_COLORS_SETTINGS.length]!;
}

export function pageColorsLabel(setting: PageColorsSetting): string {
  switch (setting) {
    case "follow":
      return "Follow";
    case "normal":
      return "Normal";
    case "dark":
      return "Dark";
  }
}
