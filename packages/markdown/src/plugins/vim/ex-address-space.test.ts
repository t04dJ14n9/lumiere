import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { installExAddressLeadingSpaceFix } from "./ex-address-space";

function buffer(text: string) {
  let state = EditorState.create({ doc: text });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  Object.defineProperty(cm, "openDialog", { value: undefined });
  // Avoid showConfirm → document when an ex command fails in Node.
  Object.defineProperty(cm, "openNotification", {
    value: () => () => {},
  });
  Vim.maybeInitVimState_(cm);
  cm.setCursor(0, 0);
  return cm;
}

const doc = "line1\nline2\nline3\nline4\nline5";

test(":3, : 3, and 3 move to line 3", () => {
  const restore = installExAddressLeadingSpaceFix();
  try {
    for (const input of ["3", " 3", "  3", ":3", ": 3"] as const) {
      const cm = buffer(doc);
      // Ex prompt feeds the text after `:`; also accept a leading `:`.
      const fed = input.startsWith(":") ? input.slice(1) : input;
      Vim.handleEx(cm, fed);
      assert.equal(
        cm.getCursor().line,
        2,
        `expected line 3 (0-based 2) for ex ${JSON.stringify(input)}, got ${cm.getCursor().line}`,
      );
    }
  } finally {
    restore();
  }
});
