import { indentUnit } from "@codemirror/language";
import { EditorState, Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Infer } from "../../kernel";
import { config } from "./manifest";
import { fontVariables } from "./font";
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
    EditorView.editorAttributes.of({
      dir: value.rightToLeft ? "rtl" : "ltr",
      // The stylesheet centres a 700 px measure when this class is present.
      ...(value.readableLineLength ? { class: "is-readable-line-width" } : {}),
    }),
    // Note text follows the editor font settings for Markdown files. As a
    // theme, a change makes CodeMirror measure line heights again, so line
    // numbers and the height map follow (an attribute change does not).
    EditorView.theme({ "&": fontVariables(value) }),
  ];
}
