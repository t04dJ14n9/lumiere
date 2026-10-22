import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import path from "node:path";
// The hosts outside VS Code (docs/HOSTS_PLAN.md, section 3): host-node knows
// no embedder; each embedder knows host-node only by its public entries.
const HOST_PACKAGES = ["host-node", "dsh", "app"];
const FORBIDDEN_BY_HOST = {
  "host-node": ["vscode", "@workshop/dsh", "@workshop/app", "@tauri-apps/"],
  dsh: ["vscode", "@workshop/app", "@tauri-apps/"],
  app: ["vscode", "@workshop/dsh"],
};
const HOST_NODE_ENTRIES = [
  "@workshop/host-node",
  "@workshop/host-node/embedding",
  "@workshop/host-node/palette",
];
function crossesHostLayer(file, source, target) {
  const owner = file.match(/\/packages\/(host-node|dsh|app)\//)?.[1];
  if (!owner) {
    return false;
  }
  if (
    FORBIDDEN_BY_HOST[owner].some(
      (name) =>
        source === name ||
        source.startsWith(name.endsWith("/") ? name : name + "/"),
    )
  ) {
    return true;
  }
  const into = target.match(/\/packages\/(host-node|dsh|app)\//)?.[1];
  if (into && into !== owner && HOST_PACKAGES.includes(into)) {
    return true;
  }
  return (
    owner !== "host-node" &&
    source.startsWith("@workshop/host-node") &&
    !HOST_NODE_ENTRIES.includes(source)
  );
}
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
      const pure =
        /\/src\/(kernel|shared|markdown)\//.test(file) ||
        /\/packages\/(core|agents)\/src\//.test(file);
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
      invalid ||= crossesHostLayer(file, source, target);
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
      // Throw-away measurement scripts (not part of the product).
      "packages/markdown/docs/obsidian-measurements/**",
      "**/dist/**",
      ".cache/**",
      "test-results/**",
      "playwright-report/**",
      "**/artifacts/**",
      // The VS Code build that `pnpm test:vscode` downloads when none is installed.
      ".vscode-test/**",
      // Throwaway measurement scripts for docs/vim-caret.md (run by hand, not shipped).
      "packages/markdown/docs/vim-caret-measurements/**",
      // PDFs generated for the PDF tests.
      "packages/pdf/test/fixtures/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
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
  { files: ["**/*.{ts,tsx}", "**/*.mjs"], rules: style },
  {
    files: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: size,
  },
  {
    // The PDF viewer's React UI.
    files: ["packages/pdf/src/webview/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Floating promises are lint errors: a promise is awaited, returned, or
    // explicitly discarded with `void`. `void` only records the decision; it
    // neither handles a rejection nor makes the work part of teardown.
    // Conventions (lint cannot prove them; review does):
    // - Detached work has an error sink: a `.catch` that logs or reports, or
    //   a function documented as never rejecting (it catches inside).
    // - Lifecycle work (stop, cleanup, dispose) is returned or awaited by its
    //   owner, or tracked by something that awaits it; never `void`ed.
    files: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./packages/core/tsconfig.json",
          "./packages/agents/tsconfig.json",
          "./packages/markdown/tsconfig.json",
          "./packages/markdown/src/host/tsconfig.json",
          "./packages/markdown/src/webview/tsconfig.json",
          "./packages/markdown/src/plugins/tsconfig.host.json",
          "./packages/markdown/src/plugins/tsconfig.webview.json",
          "./packages/markdown/src/workers/tsconfig.json",
          "./packages/pdf/tsconfig.json",
          "./packages/pdf/src/extension/tsconfig.json",
          "./packages/pdf/src/webview/tsconfig.json",
          "./packages/pdf/src/bridge-stdio/tsconfig.json",
          "./packages/host-node/src/host/tsconfig.json",
          "./packages/host-node/src/page/tsconfig.json",
          "./packages/dsh/src/host/tsconfig.json",
          "./packages/dsh/src/client/tsconfig.json",
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
