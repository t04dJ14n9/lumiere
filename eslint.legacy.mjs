// Readability backlog (AGENTS.md, "Code norms"), created 2026-10-08.
// Each list holds the files that broke that rule when the rule came in; the
// rule is off for them. Remove a file when you rewrite it to comply. Never add
// one: new and ported code complies from the start.
export default {
  "max-lines-per-function": [
    "src/host/navigation.ts",
    "src/markdown/search/canvas.ts",
    "src/plugins/embeds/image-dialog.ts",
    "src/plugins/embeds/image.ts",
    "src/plugins/embeds/post-process.ts",
    "src/plugins/embeds/webm.ts",
    "src/plugins/embeds/webview.ts",
    "src/plugins/links/host.ts",
    "src/plugins/links/webview.ts",
    "src/plugins/livePreview/inline.ts",
    "src/plugins/livePreview/rendered-position.ts",
    "src/plugins/livePreview/webview.ts",
  ],
  complexity: [
    "src/host/navigation.ts",
    "src/markdown/search/canvas.ts",
    "src/plugins/embeds/webm.ts",
    "src/plugins/links/host.ts",
    "src/plugins/livePreview/inline.ts",
  ],
  "max-params": ["src/host/navigation.ts", "src/plugins/embeds/image.ts"],
  "no-nested-ternary": [
    "src/markdown/search/canvas.ts",
    "src/plugins/embeds/image.ts",
    "src/plugins/livePreview/rendered-position.ts",
  ],
  "no-restricted-syntax": [],
};
