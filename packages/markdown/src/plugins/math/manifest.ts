import { defineManifest } from "../../shared/manifest";
import { Schema } from "@workshop/core";

/** Obsidian Editor → MathJax macros: control-sequence name → replacement. */
export const config = Schema.object({
  macros: Schema.record(Schema.string().max(4096))
    .default({})
    .description(
      "MathJax TeX macros (name → replacement), as in Obsidian’s MathJax macros setting. Use #1…#9 for arguments.",
    ),
});

export default defineManifest({
  id: "math",
  title: "Math",
  description: "Render TeX formulas with MathJax.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["syntax", "rendering", "commands"],
  config,
  contributes: {
    commands: [
      {
        id: "toggleInlineMath",
        title: "Toggle Inline Math",
        editorCommand: "editor:toggle-inline-math",
      },
      {
        id: "insertMathBlock",
        title: "Insert Math Block",
        editorCommand: "editor:insert-mathblock",
      },
    ],
  },
});
