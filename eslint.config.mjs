import js from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "node:path";
// Same baseline as PDF Workbench, with architecture boundaries for this project.
const boundaries = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      boundary: "Import violates the pure layer or plugin boundary: {{source}}",
    },
  },
  create(context) {
    const file = context.filename.replaceAll("\\", "/");
    function check(node) {
      if (!node.source) {
        return;
      }
      const source = node.source.value;
      const target = source.startsWith(".")
        ? path.resolve(path.dirname(file), source).replaceAll("\\", "/")
        : source;
      const pure = /\/src\/(kernel|shared|markdown)\//.test(file);
      let invalid =
        pure &&
        (source === "vscode" ||
          source.startsWith("node:") ||
          /\/src\/(host|webview|plugins|workers)\//.test(target));
      const owner = file.match(/\/src\/plugins\/([^/]+)\//)?.[1];
      if (owner) {
        const other = target.match(/\/src\/plugins\/([^/]+)\/([^/]+)$/);
        invalid ||= Boolean(
          other &&
            other[1] !== owner &&
            !/^(api|manifest|protocol)(\.ts)?$/.test(other[2]),
        );
        invalid ||=
          /\/src\/host\//.test(target) &&
          !(target.endsWith("/host/api/types") && node.importKind === "type");
        invalid ||=
          /\/src\/webview\//.test(target) &&
          !target.includes("/src/webview/ui/");
      }
      if (invalid) {
        context.report({ node, messageId: "boundary", data: { source } });
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
// Code norms (AGENTS.md, "Code norms"). Style rules apply to all code; size
// rules apply to source, not tests.
const style = {
  curly: ["error", "all"],
  "one-var": ["error", "never"],
};
const size = {
  "no-nested-ternary": "error",
  "max-depth": ["error", 4],
  "max-lines": [
    "error",
    { max: 400, skipBlankLines: true, skipComments: true },
  ],
  "max-lines-per-function": [
    "error",
    { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  complexity: ["error", 15],
  "max-params": ["error", 4],
  "no-restricted-syntax": [
    "error",
    {
      selector: ":function > Identifier.params[name='this']",
      message:
        "Do not spread a class across files with `this:` functions. Extract a collaborator that receives only the state it needs.",
    },
    {
      selector: "PropertyDefinition[value.type='Identifier']",
      message:
        "Do not attach imported functions to a class as fields. Define a method or call a collaborator.",
    },
  ],
};
export default tseslint.config(
  {
    ignores: [
      // Build output, including the sample plugin's.
      "**/dist/**",
      ".cache/**",
      "test-results/**",
      "playwright-report/**",
      "artifacts/**",
      // The VS Code build that `pnpm test:vscode` downloads when none is installed.
      ".vscode-test/**",
      // Probe scripts for real Obsidian: they run page code via the DevTools protocol.
      "docs/obsidian-measurements/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: { architecture: { rules: { boundaries } } },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "architecture/boundaries": "error",
      eqeqeq: ["error", "always"],
    },
  },
  { files: ["**/*.ts", "**/*.mjs"], rules: style },
  { files: ["src/**/*.ts"], ignores: ["**/*.test.ts"], rules: size },
  {
    // Floating promises are lint errors: a promise is awaited, returned, or
    // explicitly discarded with `void`. `void` only records the decision; it
    // neither handles a rejection nor makes the work part of teardown.
    // Conventions (lint cannot prove them; review does):
    // - Detached work has an error sink: a `.catch` that logs or reports, or
    //   a function documented as never rejecting (it catches inside).
    // - Lifecycle work (stop, cleanup, dispose) is returned or awaited by its
    //   owner, or tracked by something that awaits it; never `void`ed.
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./src/host/tsconfig.json",
          "./src/webview/tsconfig.json",
          "./src/plugins/tsconfig.host.json",
          "./src/plugins/tsconfig.webview.json",
          "./src/workers/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
      },
    },
  },
);
