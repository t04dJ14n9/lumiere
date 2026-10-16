import test from "node:test";
import assert from "node:assert/strict";
import {
  PropertyElement,
  PropertyNativeInput,
  PropertyTextarea,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { bindRowValueFocus } from "./row-click";

test("clicking row or value whitespace focuses the editor for immediate typing", (t) => {
  const document = installPropertyDOM(t);
  for (const kind of ["text", "number", "date", "checkbox", "yaml", "list"]) {
    const row = new PropertyElement(document);
    const value = new PropertyElement(document);
    const field =
      kind === "yaml"
        ? new PropertyTextarea(document)
        : ["number", "date", "checkbox"].includes(kind)
          ? new PropertyNativeInput(document)
          : new PropertyElement(document);
    field.type = kind;
    row.find = (selector) =>
      selector === "[data-property-edit]" ? null : field;
    value.nearest = () => null;
    bindRowValueFocus(row as unknown as HTMLElement);
    for (const target of [row, value]) {
      const click = new Event("click", { cancelable: true });
      Object.assign(click, { button: 0 });
      Object.defineProperty(click, "target", { value: target });
      row.dispatchEvent(click);
      assert.equal(document.activeElement, field, kind);
    }
  }
});

test("row clicks preserve field caret placement, pills, links and custom source actions", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const field = new PropertyElement(document);
  row.find = () => field;
  bindRowValueFocus(row as unknown as HTMLElement);
  for (const action of [
    "input",
    "textarea",
    "[contenteditable]",
    "[data-property-chip]",
    "button",
    "a",
    "[role=button]",
    "summary",
  ]) {
    const target = new PropertyElement(document);
    row.append(target);
    target.nearest = (selector) =>
      selector.split(", ").includes(action) ? target : null;
    const click = new Event("click", { cancelable: true });
    Object.assign(click, { button: 0 });
    Object.defineProperty(click, "target", { value: target });
    row.dispatchEvent(click);
    assert.equal(field.focused, 0, action);
  }
});

test("widget-ancestor contenteditable=false does not block row value focus", (t) => {
  const document = installPropertyDOM(t);
  const wrapper = new PropertyElement(document);
  wrapper.contentEditable = "false";
  const row = new PropertyElement(document);
  const blank = new PropertyElement(document);
  const field = new PropertyElement(document);
  wrapper.append(row);
  row.append(blank);
  row.find = (selector) => (selector === "[data-property-edit]" ? null : field);
  // Closest walks past the row to the CodeMirror widget wrapper.
  blank.nearest = (selector) =>
    selector.split(", ").includes("[contenteditable]") ? wrapper : null;
  bindRowValueFocus(row as unknown as HTMLElement);
  const click = new Event("click", { cancelable: true });
  Object.assign(click, { button: 0 });
  Object.defineProperty(click, "target", { value: blank });
  row.dispatchEvent(click);
  assert.equal(document.activeElement, field);
});

test("modifier clicks and context clicks keep row selection and menus", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const field = new PropertyElement(document);
  row.nearest = () => null;
  row.find = () => field;
  bindRowValueFocus(row as unknown as HTMLElement);
  for (const modifiers of [
    { shiftKey: true },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { button: 2 },
  ]) {
    const click = new Event("click", { cancelable: true });
    Object.assign(click, { button: 0, ...modifiers });
    row.dispatchEvent(click);
    assert.equal(field.focused, 0);
  }
  const cancelled = new Event("click", { cancelable: true });
  Object.assign(cancelled, { button: 0 });
  cancelled.preventDefault();
  row.dispatchEvent(cancelled);
  assert.equal(field.focused, 0);
});

test("selecting source text keeps its native selection without focusing the YAML editor", (t) => {
  const document = installPropertyDOM(t);
  const selection = document.getSelection();
  document.getSelection = () => ({ ...selection, isCollapsed: false });
  const row = new PropertyElement(document);
  const field = new PropertyElement(document);
  row.find = () => field;
  bindRowValueFocus(row as unknown as HTMLElement);
  const click = new Event("click", { cancelable: true });
  Object.assign(click, { button: 0 });
  row.dispatchEvent(click);
  assert.equal(field.focused, 0);
});
