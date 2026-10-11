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
 * One of the note's own number settings: a hand-edited value out of range or
 * of the wrong type falls back to the default, like any invalid setting.
 */
function ownNumber(
  min: number,
  max: number,
  fallback: number,
  description: string,
): Schema<number> {
  const strict = Schema.number()
    .min(min)
    .max(max)
    .description(description)
    .default(fallback);
  return new Schema<number>((value) => {
    try {
      return strict.parse(value);
    } catch {
      return fallback;
    }
  }, strict.toJSONSchema());
}

/** Obsidian 1.14.4's default body size and line height, measured (docs/obsidian-measurements/font-size.mjs). */
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;
export const DEFAULT_LINE_HEIGHT = 1.5;
export const MIN_LINE_HEIGHT = 1;
export const MAX_LINE_HEIGHT = 3;

/**
 * `markdownWorkbench.editor.fontSize`: the note's own body size in pixels, the
 * default of Obsidian's Appearance setting. Headings, code, tables, line
 * numbers, properties and footnotes are all em- or variable-relative to it.
 */
export const fontSize = ownNumber(
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  "Font size of the note text in pixels (Obsidian's default is 16). Headings, code, tables, line numbers, properties and footnotes scale with it. It replaces editor.fontSize for notes; the font family still follows editor.fontFamily.",
);

/**
 * `markdownWorkbench.editor.lineHeight`: the body's line height as a multiple
 * of the font size, so it scales with it. Obsidian's is 1.5 (24px at 16px).
 * Headings keep their own measured line heights, which are multiples too.
 */
export const lineHeight = ownNumber(
  MIN_LINE_HEIGHT,
  MAX_LINE_HEIGHT,
  DEFAULT_LINE_HEIGHT,
  "Line height of the note text as a multiple of its font size (Obsidian's default is 1.5). It replaces editor.lineHeight for notes.",
);

/**
 * VS Code's editor font settings, as they apply to Markdown files (so
 * `[markdown]` overrides count, as in the built-in text editor). The size and
 * line height are not among them: the note has its own (above). Empty defaults mean
 * "not given": the stylesheet's own fallbacks apply.
 */
export const fontFields = {
  fontFamily: lenient(Schema.string(), ""),
  fontFamilyExplicit: lenient(Schema.boolean(), false),
  /** The host's own default of `editor.fontFamily`, which VS Code appends. */
  defaultFontFamily: lenient(Schema.string(), ""),
  fontWeight: lenient(Schema.string(), "normal"),
  letterSpacing: lenient(Schema.number(), 0),
  fontLigatures: lenient(flag, false),
  fontVariations: lenient(flag, false),
};

/** `#default` asks the host for the setting's default value, not its value. */
export const fontNativeKeys = {
  ...Object.fromEntries(
    Object.keys(fontFields).map((key) => [key, `editor.${key}`]),
  ),
  defaultFontFamily: "editor.fontFamily#default",
  fontFamilyExplicit: "editor.fontFamily#explicit",
} as Record<keyof typeof fontFields, string>;

export interface FontSettings {
  fontFamily: string;
  fontFamilyExplicit?: boolean;
  defaultFontFamily: string;
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
 * CSS custom properties for the note: its own size and line height, and
 * following the built-in text editor the font family (with a monospace
 * fallback, as VS Code adds), weight, letter spacing, ligatures and variations.
 */
/**
 * CSS custom properties for the note: its own size and line height, and
 * following the built-in text editor the font family (with VS Code's
 * fallbacks), weight, letter spacing, ligatures and variations.
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
 * single name with spaces is quoted, and the host's default family list always
 * follows unless the setting is that list. The host reports its default;
 * `defaultFontFamily` only stands in where it does not.
 */
export function massagedFontFamily(family: string, fallback: string): string {
  const wrapped =
    /[,"']/.test(family) || !/[+ ]/.test(family) ? family : `"${family}"`;
  return family === fallback ? wrapped : `${wrapped}, ${fallback}`;
}

export function fontVariables(
  font: FontSettings,
  platform: Platform = "linux",
): Record<string, string> {
  const vars: Record<string, string> = {};
  const family = cssValue(font.fontFamily);
  if (family) {
    const stack = massagedFontFamily(
      family,
      font.defaultFontFamily || defaultFontFamily[platform],
    );
    const fallback = font.defaultFontFamily || defaultFontFamily[platform];
    vars["--text-font"] =
      font.fontFamilyExplicit || family !== fallback ? stack : "var(--ui-font)";
    vars["--code-font"] = stack;
  }
  const size = Math.min(Math.max(font.fontSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
  vars["--text-size"] = `${size}px`;
  const weight = cssValue(font.fontWeight);
  if (/^(normal|bold|\d{1,4})$/.test(weight)) {
    vars["--text-weight"] = weight;
  }
  // A unitless ratio, so every line scales with the size and the gutter can
  // multiply it by the size.
  vars["--line-height"] = String(
    Math.min(Math.max(font.lineHeight, MIN_LINE_HEIGHT), MAX_LINE_HEIGHT),
  );
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
