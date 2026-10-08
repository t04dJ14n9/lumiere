import { indentUnit } from "@codemirror/language";
import { EditorState, Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Infer } from "../../kernel";
import { config } from "./manifest";
const defaults = Object.freeze(config.parse({}));
export const editorSettings = Facet.define<
  Infer<typeof config>,
  Infer<typeof config>
>({ combine: (values) => values.at(-1) ?? defaults });
/** One settings compartment owns editor-wide facets and presentation. */
export function settingsExtensions(options: Partial<Infer<typeof config>>) {
  const value = config.parse(options);
  return [
    editorSettings.of(value),
    indentUnit.of(value.useTabs ? "\t" : " ".repeat(value.tabSize)),
    EditorState.tabSize.of(value.tabSize),
    EditorView.editorAttributes.of({ dir: value.rightToLeft ? "rtl" : "ltr" }),
    EditorView.theme({
      ".cm-content": { maxWidth: value.readableLineLength ? "700px" : "none" },
    }),
  ];
}
