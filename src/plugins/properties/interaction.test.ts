import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import {
  PropertyElement,
  PropertyNativeInput,
  installPropertyDOM,
  propertyKey,
} from "../../../test/support/property-dom";
import { PropertyField } from "./field-draft";
import { bindPropertyFields } from "./fields";
import { bindRowName } from "./row-name";
import { bindRowNavigation } from "./row-navigation";
import { bindPropertyChips } from "./chips";
import { bindPropertyLists } from "./lists";
import { PropertyEditing } from "./editing";
import {
  frontmatter,
  propertyChanges,
  type PropertyEdit,
} from "../../markdown/properties";

function html(element: PropertyElement): HTMLElement {
  return element as unknown as HTMLElement;
}
function input(element: PropertyElement): HTMLInputElement {
  return element as unknown as HTMLInputElement;
}

function applySource(source: string, operation: PropertyEdit): string {
  return propertyChanges(source, operation)!.reduceRight(
    (text, change) =>
      text.slice(0, change.from) + change.insert + text.slice(change.to),
    source,
  );
}

test("scalar Enter commits quoted text and focuses its row; untouched mismatches never write", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const container = new PropertyElement(document);
  container.find = () => row;
  const field = new PropertyElement(document);
  field.dataset = { propertyInput: "title", propertyKind: "text" };
  field.textContent = "Hello";
  let source = "---\ntitle: Hello\n---\nBody";
  let writes = 0;
  const editor = {
    source: "current",
    currentSource: () => source,
    set: (
      _header: string,
      key: string,
      value: string | number | boolean | null,
    ) => {
      writes++;
      source = applySource(source, { type: "set", key, value });
      return true;
    },
  };
  new PropertyField(html(container), html(field), source, editor);
  field.textContent = "a: b # c";
  field.dispatchEvent(new Event("input"));
  field.dispatchEvent(propertyKey("Enter"));
  assert.equal(frontmatter(source)?.values?.title, "a: b # c");
  assert.match(source, /title: "a: b # c"/);
  assert.equal(document.activeElement, row);
  assert.equal(writes, 1);
  const mismatch = new PropertyNativeInput(document);
  mismatch.dataset = { propertyInput: "title", propertyKind: "number" };
  mismatch.type = "number";
  new PropertyField(html(container), html(mismatch), source, editor);
  mismatch.dispatchEvent(new Event("focus"));
  mismatch.dispatchEvent(new Event("blur"));
  mismatch.dispatchEvent(new Event("property-commit", { cancelable: true }));
  assert.equal(writes, 1);
  assert.equal(frontmatter(source)?.values?.title, "a: b # c");
});

test("name Enter focuses value, rename uses the new name without copying registry types, rejects duplicates quietly", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const name = new PropertyNativeInput(document);
  const value = new PropertyElement(document);
  name.value = "a";
  row.find = (selector) =>
    selector === "[data-property-name]"
      ? name
      : selector === "[data-property-edit]"
        ? null
        : value;
  let source = "---\na: one\nb: two\n---\n";
  let typeWrites = 0;
  const editor = {
    source: "current",
    set: () => true,
    edit: () => true,
    types: () => ({ a: "text" as const }),
    setType: () => {
      typeWrites++;
    },
  };
  const edits = {
    current: () => frontmatter(source),
    apply: (operation: PropertyEdit) => {
      const changes = propertyChanges(source, operation);
      if (!changes) {
        return false;
      }
      source = applySource(source, operation);
      row.isConnected = false;
      return true;
    },
  };
  bindRowName(html(row), "a", editor, edits);
  name.dispatchEvent(propertyKey("Enter"));
  assert.equal(document.activeElement, value);
  for (const rejected of ["b", ""]) {
    name.value = rejected;
    name.focus();
    name.dispatchEvent(propertyKey("Enter"));
    assert.equal(name.value, rejected);
    assert.equal(document.activeElement, name);
    assert.equal(frontmatter(source)?.values?.a, "one");
    assert.equal(name.validityMessage, "");
  }
  name.value = "renamed";
  name.dispatchEvent(propertyKey("Enter"));
  assert.equal(frontmatter(source)?.values?.renamed, "one");
  assert.equal(typeWrites, 0);
});

test("row and field keyboard events follow measured tab stops, row motion, Delete and Escape", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  row.dataset.propertyRow = "a";
  const next = new PropertyElement(document);
  const heading = new PropertyElement(document);
  const name = new PropertyNativeInput(document);
  name.value = "a";
  name.setAttribute("data-property-name", "a");
  const value = new PropertyElement(document);
  const panel = new PropertyElement(document);
  panel.findAll = () => [row, next];
  panel.find = (selector) =>
    selector.startsWith("[data-property-row=") ? row : heading;
  row.find = (selector) =>
    selector === "[data-property-name]"
      ? name
      : selector === "[data-property-edit]"
        ? null
        : value;
  row.nearest = () => panel;
  const container = new PropertyElement(document);
  container.nearest = () => null;
  let removed = 0;
  let left = 0;
  bindRowNavigation({
    row: html(row),
    container: html(container),
    panel: html(panel),
    editor: {
      source: "current",
      set: () => true,
      focusBody: () => {
        left++;
      },
    },
    apply: () => {
      removed++;
      return true;
    },
  });
  row.dispatchEvent(propertyKey("Tab", {}, name));
  assert.equal(document.activeElement, value);
  row.dispatchEvent(propertyKey("Tab", {}, value));
  assert.equal(document.activeElement, row);
  row.dispatchEvent(propertyKey("Tab"));
  assert.equal(document.activeElement, next);
  row.dispatchEvent(propertyKey("ArrowDown"));
  assert.equal(document.activeElement, next);
  row.dispatchEvent(propertyKey("ArrowUp"));
  assert.equal(document.activeElement, heading);
  row.dispatchEvent(propertyKey("Backspace"));
  assert.equal(removed, 0);
  row.dispatchEvent(propertyKey("Delete"));
  assert.equal(removed, 1);
  row.dispatchEvent(propertyKey("Escape"));
  assert.equal(left, 1);
});

test("list input Backspace focuses the last pill, another removes it, Enter on a pill edits it", (t) => {
  const document = installPropertyDOM(t);
  const list = new PropertyElement(document);
  const add = new PropertyElement(document);
  const chips = [new PropertyElement(document), new PropertyElement(document)];
  chips.forEach((chip, index) => {
    chip.dataset.propertyChip = String(index);
    chip.parentElement = list;
  });
  list.children = [...chips, add];
  list.findAll = () => chips;
  list.find = (selector) =>
    selector === "[data-property-list-input]"
      ? add
      : (list.children.find(
          (chip) =>
            selector === `[data-property-chip="${chip.dataset.propertyChip}"]`,
        ) ?? null);
  const container = new PropertyElement(document);
  container.find = () => list;
  let values = ["a", "b"];
  const close = bindPropertyChips({
    container: html(container),
    list: html(list),
    key: "list",
    original: values,
    openMenu: () => () => {},
    actions: {
      editable: true,
      values: () => values,
      value: (field) => input(field as unknown as PropertyElement).value,
      update: (next) => {
        values = next.map(String);
        return true;
      },
      remove: (at) => {
        values.splice(at, 1);
      },
      refresh: () => {},
      copy: () => {},
      action: () => {},
    },
  });
  add.dispatchEvent(propertyKey("Backspace"));
  assert.equal(document.activeElement, chips[1]);
  chips[1]!.dispatchEvent(propertyKey("Backspace"));
  assert.deepEqual(values, ["a"]);
  chips[0]!.dispatchEvent(propertyKey("Enter"));
  const draft = document.activeElement as PropertyNativeInput;
  assert.equal(draft.value, "a");
  draft.value = "edited";
  draft.dispatchEvent(propertyKey("Enter"));
  assert.deepEqual(values, ["edited"]);
  close();
});

test("Enter adds a normalized tag, keeps pill input focus, and x removes the selected occurrence", (t) => {
  const document = installPropertyDOM(t);
  const container = new PropertyElement(document);
  const list = new PropertyElement(document);
  list.dataset.propertyList = "tags";
  const add = new PropertyElement(document);
  const chip = new PropertyElement(document);
  chip.dataset.propertyChip = "0";
  const remove = new PropertyElement(document);
  remove.dataset.propertyRemove = "0";
  list.children = [chip, add];
  list.find = (selector) =>
    selector === "[data-property-list-input]" ? add : chip;
  list.findAll = (selector) =>
    selector === "[data-property-remove]" ? [remove] : [chip];
  container.findAll = () => [list];
  container.find = (selector) =>
    selector.includes("data-property-list-input") ? add : list;
  container.nearest = () => container;
  let source = "---\ntags: [one]\n---\n";
  const close = bindPropertyLists(html(container), source, {
    source: "current",
    copy: () => {},
    openMenu: () => () => {},
    propertyEditor: {
      source: "current",
      currentSource: () => source,
      set: (_header, key, value) => {
        source = applySource(source, { type: "set", key, value });
        add.textContent = "";
        return true;
      },
    },
  });
  add.textContent = "#new";
  add.dispatchEvent(propertyKey("Enter"));
  assert.deepEqual(frontmatter(source)?.values?.tags, ["one", "new"]);
  assert.equal(document.activeElement, add);
  remove.dispatchEvent(new Event("click", { cancelable: true }));
  assert.deepEqual(frontmatter(source)?.values?.tags, ["new"]);
  close();
});

test("Mod+; begins a pending row without YAML or undo changes, including notes without frontmatter", async (t) => {
  installPropertyDOM(t);
  let state = EditorState.create({ doc: "Body" });
  let clicks = 0;
  let changes = 0;
  const view = {
    get state() {
      return state;
    },
    dom: {
      querySelector: () => ({
        click: () => {
          clicks++;
        },
      }),
    },
    dispatch: (spec: TransactionSpec) => {
      const transaction = state.update(spec);
      state = transaction.state;
      if (transaction.docChanged) {
        changes++;
      }
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
  editing.add();
  await Promise.resolve();
  assert.equal(state.doc.toString(), "Body");
  assert.equal(changes, 0);
  assert.equal(clicks, 1);
});

test("type notifications change presentation only, with no forced conversion capability", () => {
  const state = EditorState.create({ doc: "---\nstatus: 3\n---\nBody" });
  let changed = 0;
  const view = {
    state,
    dispatch: () => {
      changed++;
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
  editing.receiveTypes({ types: { status: "text" } });
  const editor = editing.editor("current");
  assert.deepEqual(editor.types?.(), { status: "text" });
  assert.equal("forcedTypes" in editor, false);
  assert.equal(changed, 0);
  assert.equal(state.doc.toString(), "---\nstatus: 3\n---\nBody");
});

test("the native checkbox activation handler writes true and false without altering neighbouring YAML", (t) => {
  const document = installPropertyDOM(t);
  const container = new PropertyElement(document);
  const panel = new PropertyElement(document);
  const checkbox = new PropertyNativeInput(document);
  checkbox.dataset.property = "done";
  checkbox.type = "checkbox";
  container.find = () => panel;
  panel.findAll = (selector) =>
    selector === "input[data-property]" ? [checkbox] : [];
  let source = "---\ndone: false # keep\ntitle: Hello\n---\nBody";
  bindPropertyFields(html(container), source, {
    source: "current",
    copy: () => {},
    openMenu: () => () => {},
    propertyEditor: {
      source: "current",
      currentSource: () => source,
      set: (_header, key, value) => {
        source = applySource(source, { type: "set", key, value });
        return true;
      },
    },
  });
  for (const checked of [true, false]) {
    checkbox.checked = checked;
    // Mouse and native Space activation both deliver this click event.
    checkbox.dispatchEvent(new Event("click"));
    assert.equal(frontmatter(source)?.values?.done, checked);
    assert.match(source, /# keep\ntitle: Hello/);
    assert.ok(source.endsWith("Body"));
  }
});

test("YAML drafts reject invalid text and concurrent property conflicts without writing", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const container = new PropertyElement(document);
  container.find = () => row;
  const field = new PropertyNativeInput(document);
  field.tagName = "TEXTAREA";
  field.dataset = { propertyInput: "generated", propertyKind: "yaml" };
  field.value = 'by: "old"\n';
  let source = '---\ngenerated:\n  by: "old"\ntitle: Note\n---\nBody';
  let writes = 0;
  const editor = {
    source: "current",
    currentSource: () => source,
    set: (
      expected: string,
      key: string,
      value: string | number | boolean | null | object,
    ) => {
      const current = frontmatter(source)?.raw ?? "";
      if (current.replace(/\r?\n$/, "") !== expected.replace(/\r?\n$/, "")) {
        return false;
      }
      const next = propertyChanges(source, {
        type: "set",
        key,
        value: value as never,
      });
      if (!next) {
        return false;
      }
      writes++;
      source = applySource(source, {
        type: "set",
        key,
        value: value as never,
      });
      return true;
    },
  };
  new PropertyField(html(container), html(field), source, editor);

  field.value = "{";
  field.dispatchEvent(new Event("input"));
  field.dispatchEvent(new Event("blur"));
  assert.equal(writes, 0);
  assert.equal(field.validityMessage, "Enter valid YAML for this property.");
  assert.deepEqual(frontmatter(source)?.values?.generated, { by: "old" });

  field.value = 'by: "fresh"\n';
  field.dispatchEvent(new Event("input"));
  // Concurrent edit of the same property while the draft is open.
  source = applySource(source, {
    type: "set",
    key: "generated",
    value: { by: "external" },
  });
  field.dispatchEvent(new Event("blur"));
  assert.equal(writes, 0);
  assert.equal(
    field.validityMessage,
    "The property changed. Reopen it and try again.",
  );
  assert.deepEqual(frontmatter(source)?.values?.generated, { by: "external" });
  assert.equal(frontmatter(source)?.values?.title, "Note");
});

test("idle property fields refresh conflict baselines after another property commits", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const container = new PropertyElement(document);
  container.find = () => row;
  const first = new PropertyNativeInput(document);
  first.tagName = "TEXTAREA";
  first.dataset = { propertyInput: "a", propertyKind: "yaml" };
  first.value = 'x: "one"\n';
  const second = new PropertyNativeInput(document);
  second.tagName = "TEXTAREA";
  second.dataset = { propertyInput: "b", propertyKind: "yaml" };
  second.value = 'y: "two"\n';
  let source = '---\na:\n  x: "one"\nb:\n  y: "two"\n---\n';
  let writes = 0;
  const editor = {
    source: "current",
    currentSource: () => source,
    set: (
      expected: string,
      key: string,
      value: string | number | boolean | null | object,
    ) => {
      const current = frontmatter(source)?.raw ?? "";
      if (current.replace(/\r?\n$/, "") !== expected.replace(/\r?\n$/, "")) {
        return false;
      }
      const operation = {
        type: "set" as const,
        key,
        value: value as never,
      };
      if (!propertyChanges(source, operation)) {
        return false;
      }
      writes++;
      source = applySource(source, operation);
      return true;
    },
  };
  new PropertyField(html(container), html(first), source, editor);
  new PropertyField(html(container), html(second), source, editor);

  first.dispatchEvent(new Event("focus"));
  first.value = 'x: "edited"\n';
  first.dispatchEvent(new Event("input"));
  first.dispatchEvent(new Event("blur"));
  assert.equal(writes, 1);
  assert.deepEqual(frontmatter(source)?.values?.a, { x: "edited" });

  second.dispatchEvent(new Event("focus"));
  second.value = 'y: "next"\n';
  second.dispatchEvent(new Event("input"));
  second.dispatchEvent(new Event("blur"));
  assert.equal(writes, 2);
  assert.deepEqual(frontmatter(source)?.values?.b, { y: "next" });
  assert.deepEqual(frontmatter(source)?.values?.a, { x: "edited" });
});
