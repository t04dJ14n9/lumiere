import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// AGENTS.md "Code norms": the readability limits apply to all source, and
// nothing may loosen them to make code pass. The linter cannot police its own
// configuration, so this test does.

const readability = {
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

test("the readability backlog stays deleted", () => {
  assert.equal(existsSync("eslint.legacy.mjs"), false);
});

test("the readability limits apply to all source, unchanged", async () => {
  // A computed specifier: the configuration is JavaScript without types.
  const path = "../../eslint.config.mjs";
  const { default: config } = (await import(path)) as {
    default: { files?: string[]; rules?: object }[];
  };
  const blocks = config.filter(
    (block) =>
      block.rules &&
      Object.keys(readability).some((rule) => rule in block.rules!),
  );
  assert.equal(blocks.length, 1, "one configuration block sets the limits");
  const [block] = blocks;
  assert.deepEqual(block!.files, [
    "src/**/*.{ts,tsx}",
    "packages/*/src/**/*.{ts,tsx}",
  ]);
  // Only tests are exempt: all product code meets the limits.
  assert.deepEqual((block as { ignores?: string[] }).ignores, ["**/*.test.ts"]);
  for (const [rule, setting] of Object.entries(readability)) {
    assert.deepEqual(
      (block!.rules as Record<string, unknown>)[rule],
      setting,
      rule,
    );
  }
});

// Each reviewed exception, by file and the rules it disables. Adding one
// needs a reason in the comment and an entry here, in the same review.
const allowed = [
  "packages/core/src/types.ts: @typescript-eslint/no-empty-object-type",
  "packages/core/src/types.ts: @typescript-eslint/no-empty-object-type",
  "packages/markdown/src/markdown/html/index.ts: @typescript-eslint/triple-slash-reference",
  "packages/markdown/test/browser/fake-host.ts: @typescript-eslint/no-this-alias",
  "packages/pdf/src/extension/plugins/agentBridge/mcp/server.ts: preserve-caught-error",
  "packages/pdf/src/shared/look-up.ts: no-control-regex",
  "packages/pdf/src/webview/engine.tsx: react-hooks/exhaustive-deps",
  "packages/pdf/src/webview/reading-position.ts: react-hooks/exhaustive-deps",
  "packages/pdf/test/unit/identity/contribution-parity.test.ts: @typescript-eslint/no-explicit-any",
  "packages/pdf/test/vscode/workbench.ts: no-empty-pattern",
];

test("inline lint exceptions are the reviewed ones, each with a reason", () => {
  const found: string[] = [];
  for (const root of [
    "src",
    "test",
    "scripts",
    "packages/core/src",
    "packages/core/test",
    "packages/markdown/src",
    "packages/markdown/test",
    "packages/markdown/scripts",
    "packages/pdf/src",
    "packages/pdf/test",
    "packages/pdf/scripts",
  ]) {
    for (const path of readdirSync(root, {
      recursive: true,
      encoding: "utf8",
    })) {
      if (
        !/\.(ts|tsx|mts|mjs|js)$/.test(path) ||
        path.endsWith("lint-rules.test.ts")
      ) {
        continue;
      }
      const file = `${root}/${path}`;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const directive = /eslint-disable(?:-next-line|-line)?\b(.*)$/.exec(
          line,
        );
        if (!directive) {
          continue;
        }
        const [rules, reason] = directive[1]!.split(" -- ");
        assert.ok(reason?.trim(), `${file}: an exception needs "-- <reason>"`);
        assert.ok(
          rules?.trim(),
          `${file}: an exception must name the rules it disables`,
        );
        found.push(`${file}: ${rules!.trim()}`);
      }
    }
  }
  for (const entry of found) {
    assert.ok(
      !Object.keys(readability).some((rule) => entry.includes(rule)),
      `readability limits have no exceptions: ${entry}`,
    );
  }
  assert.deepEqual(found.sort(), [...allowed].sort());
});
