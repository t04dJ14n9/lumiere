import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/** Load with a stand-in HTMLElement so instanceof works outside a browser. */
function loadIsEditable() {
  class HTMLElement {
    constructor(private readonly match: boolean) {}
    closest(_selector: string): HTMLElement | null {
      return this.match ? this : null;
    }
  }
  const source = readFileSync(
    new URL("../../src/webview/editable-target.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function(require, module, exports) { ${output}\n})`,
    { HTMLElement },
  ) as (
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
  ) => void;
  evaluate(
    () => {
      throw new Error("no deps");
    },
    module,
    module.exports,
  );
  return {
    isEditableTarget: module.exports.isEditableTarget as (
      target: unknown,
    ) => boolean,
    HTMLElement,
  };
}

test("isEditableTarget uses HTMLElement closest for editable fields", () => {
  const { isEditableTarget, HTMLElement } = loadIsEditable();
  assert.equal(isEditableTarget(new HTMLElement(true)), true);
  assert.equal(isEditableTarget(new HTMLElement(false)), false);
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({}), false);
});

test("editable selector includes bare contenteditable, not only =true", () => {
  const source = readFileSync(
    new URL("../../src/webview/editable-target.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\[contenteditable\]:not\(\[contenteditable="false"\]\)/,
  );
  assert.doesNotMatch(source, /contenteditable="true"/);
});
