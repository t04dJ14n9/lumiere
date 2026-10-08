import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { Infer } from "../../kernel";
import type { config } from "./manifest";

/** Single owner for indentation throughout the outer editor. */
export const settingsExtensions = (value: Infer<typeof config>) => [
  indentUnit.of(value.useTabs ? "\t" : " ".repeat(value.tabSize)),
  EditorState.tabSize.of(value.tabSize),
];
