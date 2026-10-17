import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
// Cordis schedules plugins and injects services; this layer only adds
// resource ownership, events and optional services, and should stay small.
test("the plugin core stays small: under 1,100 lines of code besides its schema builder", () => {
  const code = readdirSync("packages/core/src")
    .filter((p) => p.endsWith(".ts") && p !== "schema.ts")
    .flatMap((p) => readFileSync(`packages/core/src/${p}`, "utf8").split("\n"))
    .filter((line) => line.trim() && !/^\s*(\/\/|\/\*|\*)/.test(line));
  assert.ok(code.length < 1100, `${code.length} lines of core code`);
});
test("typed event call sites use the declared dispatch mode", () => {
  const files = ["src", "test/unit", "packages/core"].flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((p) => p.endsWith(".ts"))
      .map((p) => `${root}/${p}`),
  );
  const trees = files.map((file) =>
    ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    ),
  );
  const modes = new Map<string, string>();
  function visit(node: ts.Node, fn: (node: ts.Node) => void) {
    fn(node);
    ts.forEachChild(node, (n) => visit(n, fn));
  }
  for (const tree of trees) {
    visit(tree, (node) => {
      if (ts.isPropertySignature(node) && node.name) {
        const mode = ts
          .getJSDocTags(node)
          .find((t) => t.tagName.text === "mode")?.comment;
        if (typeof mode === "string") {
          modes.set(node.name.getText(tree).replaceAll(/['"]/g, ""), mode);
        }
      }
    });
  }
  for (const tree of trees) {
    visit(tree, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const mode = node.expression.name.text;
        const name = node.arguments[0];
        if (
          ["emit", "serial", "parallel", "bail", "pipeline"].includes(mode) &&
          name &&
          ts.isStringLiteral(name)
        ) {
          assert.equal(
            mode,
            modes.get(name.text),
            `${tree.fileName}: ${name.text}`,
          );
        }
      }
    });
  }
});
