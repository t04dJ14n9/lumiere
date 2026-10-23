import test from "node:test";
import assert from "node:assert/strict";
import { isNoteBodyIndentTarget } from "./indent-target";

type Stub = {
  closest?: (sel: string) => unknown;
  contains?: (n: unknown) => boolean;
  parentElement?: Stub | null;
  nodeType?: number;
};

test("isNoteBodyIndentTarget: contentDOM and contained marks pass (BH-066)", () => {
  const content: Stub = {
    contains(n) {
      return n === mark || n === text;
    },
  };
  const dom: Stub = {};
  const mark: Stub = {
    closest(sel) {
      return sel === ".cm-editor" ? dom : null;
    },
  };
  const text: Stub = { nodeType: 3, parentElement: mark };
  const view = {
    contentDOM: content as unknown as EventTarget & {
      contains?: (n: EventTarget) => boolean;
    },
    dom: dom as unknown as EventTarget,
  };
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
      if (sel === ".cm-editor") {
        return cellEditor;
      }
      return null;
    },
  };
  const prop: Stub = {
    closest(sel) {
      return sel.includes("data-property-input") ? prop : null;
    },
  };
  const view = {
    contentDOM: content as unknown as EventTarget & {
      contains?: (n: EventTarget) => boolean;
    },
    dom: noteDom as unknown as EventTarget,
  };
  assert.equal(
    isNoteBodyIndentTarget(view, cell as unknown as EventTarget),
    false,
  );
  assert.equal(
    isNoteBodyIndentTarget(view, prop as unknown as EventTarget),
    false,
  );
});
