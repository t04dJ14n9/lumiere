// Readability backlog (AGENTS.md, "Code norms"), created 2026-10-08.
// Each list holds the files that broke that rule when the rule came in; the
// rule is off for them. Remove a file when you rewrite it to comply. Never add
// one: new and ported code complies from the start.
export default {
  "max-lines-per-function": [
    "src/plugins/embeds/post-process.ts",
    "src/plugins/embeds/webm.ts",
    "src/plugins/embeds/webview.ts",
  ],
  complexity: ["src/plugins/embeds/webm.ts"],
  "max-params": ["src/host/navigation.ts", "src/plugins/embeds/image.ts"],
  "no-nested-ternary": ["src/plugins/embeds/image.ts"],
  "no-restricted-syntax": [],
};
