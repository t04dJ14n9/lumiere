import { Schema } from "../../kernel";

/**
 * A native editor setting read for Markdown files: an invalid value (from a
 * hand-edited settings.json) falls back instead of failing the whole config.
 */
function lenient<T>(schema: Schema<T>, fallback: T): Schema<T> {
  return new Schema<T>((value) => {
    try {
      return schema.parse(value);
    } catch {
      return fallback;
    }
  }, {}).default(fallback);
}

const flag = new Schema<boolean | string>((value) => {
  if (typeof value !== "boolean" && typeof value !== "string") {
    throw new Error("Expected a boolean or a string");
  }
  return value;
}, {});

/**
 * VS Code's editor font settings, as they apply to Markdown files (so
 * `[markdown]` overrides count, as in the built-in text editor). Empty
 * defaults mean "not given": the stylesheet's own fallbacks apply.
 */
export const fontFields = {
  fontFamily: lenient(Schema.string(), ""),
  fontSize: lenient(Schema.number(), 0),
  fontWeight: lenient(Schema.string(), "normal"),
  lineHeight: lenient(Schema.number(), 0),
  letterSpacing: lenient(Schema.number(), 0),
  fontLigatures: lenient(flag, false),
  fontVariations: lenient(flag, false),
};

export const fontNativeKeys = Object.fromEntries(
  Object.keys(fontFields).map((key) => [key, `editor.${key}`]),
) as Record<keyof typeof fontFields, string>;

export interface FontSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  letterSpacing: number;
  fontLigatures: boolean | string;
  fontVariations: boolean | string;
}

/** Text that can sit in a CSS value without ending the declaration. */
function cssValue(text: string): string {
  return text.replace(/[;{}<>\\\n\r]/g, "").trim();
}

function numericWeight(weight: string): number {
  if (weight === "bold") {
    return 700;
  }
  const value = Number(weight);
  return Number.isFinite(value) && value > 0 ? value : 400;
}

/** `editor.fontLigatures`: on, off, or the font-feature-settings to use. */
function ligatureSettings(ligatures: boolean | string): string {
  if (ligatures === true) {
    return '"liga" on, "calt" on';
  }
  const features = ligatures === false ? "" : cssValue(ligatures);
  return features || '"liga" off, "calt" off';
}

/** `editor.fontVariations`: the weight as `wght`, or the settings to use. */
function variationSettings(variations: boolean | string, weight: number) {
  if (variations === true) {
    return `"wght" ${weight}`;
  }
  return (variations === false ? "" : cssValue(variations)) || "normal";
}

/**
 * VS Code's line height in pixels (`BareFontInfo._create`): 0 is the golden
 * ratio of the size (1.35, or 1.5 on macOS), below 8 is a multiplier, else
 * pixels; rounded to a whole pixel and at least 8.
 */
export function lineHeightPixels(
  lineHeight: number,
  fontSize: number,
  mac: boolean,
): number {
  let pixels = lineHeight;
  if (lineHeight <= 0) {
    pixels = (mac ? 1.5 : 1.35) * fontSize;
  } else if (lineHeight < 8) {
    pixels = lineHeight * fontSize;
  }
  return Math.max(Math.round(pixels), 8);
}

/**
 * CSS custom properties for the note, following the built-in text editor:
 * the font family (with a monospace fallback, as VS Code adds), size,
 * weight, line height, letter spacing, ligatures and variations.
 */
export type Platform = "mac" | "windows" | "linux";

/** VS Code's `EDITOR_FONT_DEFAULTS.fontFamily` for each platform. */
export const defaultFontFamily: Readonly<Record<Platform, string>> = {
  mac: "Menlo, Monaco, 'Courier New', monospace",
  windows: "Consolas, 'Courier New', monospace",
  linux: "'Droid Sans Mono', 'monospace', monospace",
};

/**
 * The family as VS Code applies it (`BareFontInfo.getMassagedFontFamily`): a
 * single name with spaces is quoted, and the platform's default family list
 * always follows unless the setting is that list.
 */
export function massagedFontFamily(family: string, platform: Platform): string {
  const fallback = defaultFontFamily[platform];
  const wrapped =
    /[,"']/.test(family) || !/[+ ]/.test(family) ? family : `"${family}"`;
  return family === fallback ? wrapped : `${wrapped}, ${fallback}`;
}

export function fontVariables(
  font: FontSettings,
  platform: Platform = "linux",
): Record<string, string> {
  const mac = platform === "mac";
  const vars: Record<string, string> = {};
  const family = cssValue(font.fontFamily);
  if (family) {
    const stack = massagedFontFamily(family, platform);
    vars["--text-font"] = stack;
    vars["--code-font"] = stack;
  }
  const size = Math.min(Math.max(font.fontSize, 0), 100);
  if (size > 0) {
    vars["--text-size"] = `${Math.max(size, 6)}px`;
  }
  const weight = cssValue(font.fontWeight);
  if (/^(normal|bold|\d{1,4})$/.test(weight)) {
    vars["--text-weight"] = weight;
  }
  if (size > 0) {
    // A unitless ratio, so the gutter can multiply it by the size.
    const pixels = lineHeightPixels(font.lineHeight, Math.max(size, 6), mac);
    // Exact, so that ratio × size is the whole pixel count VS Code uses.
    vars["--line-height"] = String(pixels / Math.max(size, 6));
  } else if (font.lineHeight > 0 && font.lineHeight < 8) {
    vars["--line-height"] = String(font.lineHeight);
  }
  if (font.letterSpacing) {
    vars["--text-letter-spacing"] =
      `${Math.min(Math.max(font.letterSpacing, -5), 20)}px`;
  }
  vars["--text-features"] = ligatureSettings(font.fontLigatures);
  vars["--text-variations"] = variationSettings(
    font.fontVariations,
    numericWeight(weight),
  );
  return vars;
}
