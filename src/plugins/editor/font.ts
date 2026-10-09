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
 * CSS custom properties for the note, following the built-in text editor:
 * the font family (with a monospace fallback, as VS Code adds), size,
 * weight, letter spacing, ligatures and variations. A line height of 0 keeps
 * the note's own 1.5 (Obsidian's); a value below 8 is a multiplier and a
 * larger one is pixels, as in VS Code.
 */
export function fontVariables(font: FontSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  const family = cssValue(font.fontFamily);
  if (family) {
    // VS Code adds a fallback too; skip it when the list ends in a generic.
    const generic = /(^|,)\s*(monospace|sans-serif|serif|system-ui)\s*$/;
    const font = generic.test(family) ? family : `${family}, monospace`;
    vars["--text-font"] = font;
    vars["--code-font"] = font;
  }
  const size = Math.min(Math.max(font.fontSize, 0), 100);
  if (size > 0) {
    vars["--text-size"] = `${Math.max(size, 6)}px`;
  }
  const weight = cssValue(font.fontWeight);
  if (/^(normal|bold|\d{1,4})$/.test(weight)) {
    vars["--text-weight"] = weight;
  }
  if (font.lineHeight > 0 && font.lineHeight < 8) {
    vars["--line-height"] = String(font.lineHeight);
  } else if (font.lineHeight >= 8 && size > 0) {
    vars["--line-height"] = String(
      Math.round((font.lineHeight / Math.max(size, 6)) * 10000) / 10000,
    );
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
