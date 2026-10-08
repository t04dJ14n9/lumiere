import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { InputGroups } from "./input-groups";
import { editGroup } from "./input-annotation";

test("plain input grouping follows adjacency, timing and selection boundaries", () => {
  const groups = new InputGroups();
  groups.attach({
    hasFocus: true,
    dom: { addEventListener() {} },
  } as unknown as EditorView);
  let state = EditorState.create({ doc: "", extensions: groups.extension });
  const insert = (text: string, time: number) => {
    const transaction = state.update({
      changes: { from: state.doc.length, insert: text },
      userEvent: "input.type",
      annotations: Transaction.time.of(time),
    });
    state = transaction.state;
    return transaction.annotation(editGroup);
  };
  const first = insert("a", 0);
  assert.ok(first);
  assert.equal(insert("b", 100), first);
  const paused = insert("c", 1000);
  assert.notEqual(paused, first);
  state = state.update({ selection: { anchor: 1 } }).state;
  assert.notEqual(insert("d", 1100), paused);
  groups.dispose();
});

test("explicit and remote edits end plain-input groups without overriding their annotations", () => {
  const groups = new InputGroups();
  groups.attach({
    hasFocus: true,
    dom: { addEventListener() {} },
  } as unknown as EditorView);
  let state = EditorState.create({ doc: "", extensions: groups.extension });
  const first = state.update({
    changes: { from: 0, insert: "a" },
    annotations: Transaction.time.of(0),
    userEvent: "input.type",
  });
  state = first.state;
  const explicit = state.update({
    changes: { from: 1, insert: "b" },
    annotations: editGroup.of("table-command"),
  });
  assert.equal(explicit.annotation(editGroup), "table-command");
  const remote = explicit.state.update({
    changes: { from: 2, insert: "c" },
    annotations: Transaction.remote.of(true),
  });
  assert.equal(remote.annotation(editGroup), undefined);
  const next = remote.state.update({
    changes: { from: 3, insert: "d" },
    annotations: Transaction.time.of(100),
    userEvent: "input.type",
  });
  assert.notEqual(next.annotation(editGroup), first.annotation(editGroup));
  groups.dispose();
});
