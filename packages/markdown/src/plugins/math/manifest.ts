import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "math",
  title: "Math",
  description: "Render TeX formulas with MathJax.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["syntax", "rendering", "commands"],
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
