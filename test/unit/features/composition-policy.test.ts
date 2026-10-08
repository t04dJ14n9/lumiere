import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { features } from "../../../src/plugins/catalog";

test("feature modules never supply editor-wide singleton settings", () => {
  for (const { id } of features) {
    const directory = `src/plugins/${id}`;
    for (const file of readdirSync(directory, {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const path = `${directory}/${file}`;
      const tree = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const names = new Map<string, string>();
      for (const node of tree.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          !node.moduleSpecifier.text.startsWith("@codemirror/")
        )
          continue;
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          for (const name of bindings.elements)
            names.set(
              name.name.text,
              name.propertyName?.text ?? name.name.text,
            );
      }
      const normalized = (node: ts.Expression): string => {
        if (ts.isIdentifier(node)) return names.get(node.text) ?? node.text;
        if (ts.isPropertyAccessExpression(node))
          return `${normalized(node.expression)}.${node.name.text}`;
        return "";
      };
      function visit(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node)) {
          assert.ok(
            ![
              "indentUnit.of",
              "EditorState.tabSize.of",
              "EditorState.readOnly.of",
              "EditorView.editable.of",
              "EditorView.lineWrapping",
            ].includes(normalized(node)),
            `${path}: ${node.getText(tree)}`,
          );
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
});
