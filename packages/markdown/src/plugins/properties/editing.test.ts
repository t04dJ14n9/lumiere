import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { PropertyEditing, isNestedPropertyValue } from "./editing";
import { frontmatter } from "../../markdown/properties";
import { itemOccurrence } from "./chips";
import { protocol } from "./protocol";

test("property edits reject stale headers and combine displayed ordering with one source transaction", () => {
  let state = EditorState.create({ doc: "---\na: 1\nb: two\n---\nBody" });
  let transactions = 0;
  const view = {
    get state() {
      return state;
    },
    dom: {
      querySelectorAll: () => [
        { dataset: { propertyRow: "b" } },
        { dataset: { propertyRow: "a" } },
      ],
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
      transactions++;
    },
  } as unknown as EditorView;
  const editing = new PropertyEditing({
    view: () => view,
    setStatus: () => {},
    action: () => {},
    refresh: () => {},
    setType: () => {},
    show: () => {},
    focusTitle: () => {},
    pageHeading: () => {},
    signal: new AbortController().signal,
  });
  assert.equal(
    editing.edit("stale", { type: "set", key: "a", value: 2 }),
    false,
  );
  assert.equal(transactions, 0);
  assert.equal(
    editing.edit(frontmatter(state.doc.toString())!.raw, {
      type: "set",
      key: "a",
      value: 2,
    }),
    true,
  );
  assert.equal(transactions, 1);
  assert.deepEqual(Object.keys(frontmatter(state.doc.toString())!.values!), [
    "b",
    "a",
  ]);
  assert.equal(frontmatter(state.doc.toString())!.values!.a, 2);
  assert.ok(state.doc.toString().endsWith("Body"));
});

test("chip editing tracks duplicate occurrences through concurrent list additions and removals", () => {
  assert.equal(itemOccurrence(["a", "b", "a"], ["x", "a", "b", "a"], 2), 3);
  assert.equal(itemOccurrence(["a", "b", "a"], ["a", "b"], 2), -1);
});

test("property RPC rejects arbitrary preference types and oversized keys", () => {
  assert.throws(() =>
    protocol.requests.setType.params.parse({ key: "a", kind: "html" }),
  );
  assert.throws(() =>
    protocol.requests.setType.params.parse({
      key: "a".repeat(256),
      kind: "text",
    }),
  );
  assert.deepEqual(protocol.requests.setType.params.parse({ key: "a" }), {
    key: "a",
  });
});

test("type conversion leaves nested objects in source but permits scalar lists", () => {
  for (const value of [null, "text", 1, false, [], [null, 1, "text", false]]) {
    assert.equal(isNestedPropertyValue(value), false);
  }
  for (const value of [{ child: 1 }, [["nested"]], [{ child: 1 }]]) {
    assert.equal(isNestedPropertyValue(value), true);
  }
});
