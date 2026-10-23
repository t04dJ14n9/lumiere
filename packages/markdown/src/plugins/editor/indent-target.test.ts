import test from "node:test";
import assert from "node:assert/strict";
import { isNoteBodyIndentTarget, type IndentTargetView } from "./indent-target";

type Stub = {
  closest?: (sel: string) => unknown;
  contains?: (n: unknown) => boolean;
  parentElement?: Stub | null;
  nodeType?: number;
};

function viewOf(content: Stub, dom: Stub): IndentTargetView {
  return {
    contentDOM: content as unknown as IndentTargetView["contentDOM"],
    dom: dom as unknown as EventTarget,
  };
}

test("isNoteBodyIndentTarget: contentDOM and cm-line marks pass (BH-066)", () => {
  const line: Stub = {};
  const mark: Stub = {
    closest(sel) {
      if (sel === ".cm-line") {
        return line;
      }
      if (sel === ".cm-editor") {
        return dom;
      }
      return null;
    },
  };
  const text: Stub = { nodeType: 3, parentElement: mark };
  const content: Stub = {
    contains(n) {
      return n === mark || n === text;
    },
  };
  const dom: Stub = {};
  const view = viewOf(content, dom);
  assert.equal(
    isNoteBodyIndentTarget(view, content as unknown as EventTarget),
    true,
  );
  assert.equal(
    isNoteBodyIndentTarget(view, mark as unknown as EventTarget),
    true,
  );
  assert.equal(
    isNoteBodyIndentTarget(view, text as unknown as EventTarget),
    true,
  );
  assert.equal(isNoteBodyIndentTarget(view, null), false);
});

test("isNoteBodyIndentTarget: add-button outside cm-line excluded (BH-040)", () => {
  const btn: Stub = {
    closest(sel) {
      if (sel === ".cm-line") {
        return null;
      }
      if (sel === ".cm-editor") {
        return dom;
      }
      return null;
    },
  };
  const content: Stub = {
    contains(n) {
      return n === btn;
    },
  };
  const dom: Stub = {};
  assert.equal(
    isNoteBodyIndentTarget(viewOf(content, dom), btn as unknown as EventTarget),
    false,
  );
});

test("isNoteBodyIndentTarget: table cell / property inputs are excluded", () => {
  const content: Stub = {
    contains() {
      return true;
    },
  };
  const noteDom: Stub = {};
  const cellEditor: Stub = {};
  const cell: Stub = {
    closest(sel) {
      if (sel.includes("table-cell-content")) {
        return cell;
      }
      if (sel === ".cm-line") {
        return cell;
      }
      if (sel === ".cm-editor") {
        return cellEditor;
      }
      return null;
    },
  };
  const prop: Stub = {
    closest(sel) {
      if (sel.includes("data-property-input")) {
        return prop;
      }
      if (sel === ".cm-line") {
        return prop;
      }
      return null;
    },
  };
  const view = viewOf(content, noteDom);
  assert.equal(
    isNoteBodyIndentTarget(view, cell as unknown as EventTarget),
    false,
  );
  assert.equal(
    isNoteBodyIndentTarget(view, prop as unknown as EventTarget),
    false,
  );
});
