import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
test("kernel stays under 1,000 formatted production lines", () => {
  const lines = readdirSync("src/kernel")
    .filter((p) => p.endsWith(".ts"))
    .reduce(
      (sum, p) =>
        sum +
        readFileSync(`src/kernel/${p}`, "utf8").trimEnd().split("\n").length,
      0,
    );
  assert.ok(lines < 1000, `${lines} kernel lines`);
});
test("typed event call sites use the declared dispatch mode", () => {
  const files = ["src", "test/unit"].flatMap((root) =>
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
