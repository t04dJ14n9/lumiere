import { Schema } from "@workshop/core";
import type { CaretSettings } from "./caret";

/** Invalid hand-edited native settings must not prevent the editor opening. */
function nativeSetting<T>(schema: Schema<T>, fallback: T): Schema<T> {
  return new Schema<T>((value) => {
    try {
      return schema.parse(value);
    } catch {
      return fallback;
    }
  }, {}).default(fallback);
}

export const caretFields = {
  cursorStyle: nativeSetting<CaretSettings["cursorStyle"]>(
    Schema.union([
      "line",
      "block",
      "underline",
      "line-thin",
      "block-outline",
      "underline-thin",
    ]),
    "line",
  ),
  cursorBlinking: nativeSetting<CaretSettings["cursorBlinking"]>(
    Schema.union(["blink", "smooth", "phase", "expand", "solid"]),
    "blink",
  ),
  cursorSmoothCaretAnimation: nativeSetting<
    CaretSettings["cursorSmoothCaretAnimation"]
  >(Schema.union(["off", "explicit", "on"]), "off"),
  cursorWidth: nativeSetting(Schema.number().min(0), 0),
};

export const caretNativeKeys = Object.fromEntries(
  Object.keys(caretFields).map((key) => [key, `editor.${key}`]),
) as Record<keyof typeof caretFields, string>;
