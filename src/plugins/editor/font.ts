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

/** Obsidian 1.14.4's default body size, measured (docs/obsidian-measurements/font-size.mjs). */
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;

/**
 * `markdownWorkbench.editor.fontSize`: the note's own body size in pixels, the
 * default of Obsidian's Appearance setting. Headings, code, tables, line
 * numbers, properties and footnotes are all em- or variable-relative to it. A
 * hand-edited value out of range or of the wrong type falls back to the default.
 */
const strictFontSize = Schema.number()
  .min(MIN_FONT_SIZE)
  .max(MAX_FONT_SIZE)
  .description(
    "Font size of the note text in pixels (Obsidian's default is 16). Headings, code, tables, line numbers, properties and footnotes scale with it. It replaces editor.fontSize for notes; the font family still follows editor.fontFamily.",
  )
  .default(DEFAULT_FONT_SIZE);
export const fontSize = new Schema<number>((value) => {
  try {
    return strictFontSize.parse(value);
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}, strictFontSize.toJSONSchema());

/**
 * VS Code's editor font settings, as they apply to Markdown files (so
 * `[markdown]` overrides count, as in the built-in text editor). The size is
 * not among them: the note has its own (`fontSize` above). Empty defaults mean
 * "not given": the stylesheet's own fallbacks apply.
 */
export const fontFields = {
  fontFamily: lenient(Schema.string(), ""),
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
 * CSS custom properties for the note: its own size, and following the
 * built-in text editor the font family (with a monospace fallback, as VS Code
 * adds), weight, line height, letter spacing, ligatures and variations.
 */
export function fontVariables(
  font: FontSettings,
  mac = false,
): Record<string, string> {
  const vars: Record<string, string> = {};
  const family = cssValue(font.fontFamily);
  if (family) {
    // VS Code adds a fallback too; skip it when the list ends in a generic.
    const generic = /(^|,)\s*(monospace|sans-serif|serif|system-ui)\s*$/;
    const font = generic.test(family) ? family : `${family}, monospace`;
    vars["--text-font"] = font;
    vars["--code-font"] = font;
  }
  const size = Math.min(Math.max(font.fontSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
  vars["--text-size"] = `${size}px`;
  const weight = cssValue(font.fontWeight);
  if (/^(normal|bold|\d{1,4})$/.test(weight)) {
    vars["--text-weight"] = weight;
  }
  // A unitless ratio, so the gutter can multiply it by the size.
  const pixels = lineHeightPixels(font.lineHeight, size, mac);
  vars["--line-height"] = String(Math.round((pixels / size) * 1e6) / 1e6);
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
