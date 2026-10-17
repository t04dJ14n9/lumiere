import test from "node:test";
import assert from "node:assert/strict";
import {
  PropertyElement,
  PropertyNativeInput,
  PropertyTextarea,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { bindRowValueFocus } from "./row-click";

function pointer(
  target: EventTarget,
  extras: Record<string, unknown> = {},
): Event {
  const event = new Event("pointerdown", { cancelable: true });
  Object.assign(event, { button: 0, ...extras });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

test("pointerdown on row or value whitespace focuses the editor for immediate typing", (t) => {
  const document = installPropertyDOM(t);
  for (const kind of ["text", "number", "date", "checkbox", "yaml", "list"]) {
    const row = new PropertyElement(document);
    const value = new PropertyElement(document);
    value.className = "metadata-property-value";
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
      row.dispatchEvent(pointer(target));
      assert.equal(document.activeElement, field, kind);
    }
  }
});

test("row pointerdown preserves field caret placement, pills, links and custom source actions", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const field = new PropertyElement(document);
  row.find = () => field;
  bindRowValueFocus(row as unknown as HTMLElement);
  for (const action of [
    "input",
    "textarea",
    "[contenteditable='true']",
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
    row.dispatchEvent(pointer(target));
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
  blank.className = "metadata-property-value";
  row.append(blank);
  row.find = (selector) => (selector === "[data-property-edit]" ? null : field);
  // Simulate a buggy broad closest() hitting the CM wrapper; contains() must reject it.
  blank.nearest = () => wrapper;
  bindRowValueFocus(row as unknown as HTMLElement);
  const event = pointer(blank);
  row.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, field);
});

test("custom Sources text stays selectable without focusing the YAML editor", (t) => {
  const document = installPropertyDOM(t);
  const row = new PropertyElement(document);
  const complex = new PropertyElement(document);
  complex.className = "property-complex";
  const sources = new PropertyElement(document);
  sources.className = "source-id";
  sources.textContent = "src-1";
  const field = new PropertyTextarea(document);
  complex.append(sources);
  row.append(complex);
  row.find = (selector) => (selector === "[data-property-edit]" ? null : field);
  sources.nearest = () => null;
  bindRowValueFocus(row as unknown as HTMLElement);
  const event = pointer(sources);
  row.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(field.focused, 0);
});

test("modifier and context pointerdowns keep row selection and menus", (t) => {
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
    row.dispatchEvent(pointer(row, modifiers));
    assert.equal(field.focused, 0);
  }
  const cancelled = pointer(row);
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
  row.dispatchEvent(pointer(row));
  assert.equal(field.focused, 0);
});
