import test from "node:test";
import assert from "node:assert/strict";
import { EditorView } from "@codemirror/view";
import {
  PropertyElement,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { pasteView } from "./webview";

test("rich paste in a Properties contenteditable cannot also insert into the Markdown document", (t) => {
  const document = installPropertyDOM(t);
  const field = new PropertyElement(document);
  const editable = new PropertyElement(document);
  const outer = { dom: { contains: () => true } } as unknown as EditorView;
  t.mock.method(EditorView, "findFromDOM", () => outer);
  field.nearest = (selector) =>
    selector === "[contenteditable]" ? editable : null;
  const event = {
    target: field,
    defaultPrevented: false,
  } as unknown as ClipboardEvent;
  assert.equal(pasteView(event, outer), undefined);
  editable.classList.contains = (name: string) => name === "cm-content";
  assert.equal(pasteView(event, outer), outer);
  field.nearest = (selector) => (selector === "input, textarea" ? field : null);
  assert.equal(pasteView(event, outer), undefined);
});
