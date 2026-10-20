import test from "node:test";
import assert from "node:assert/strict";
import { EditorView } from "@codemirror/view";
import {
  PropertyElement,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { bindSources } from "./bind";

test("Showing more sources asks CodeMirror to remeasure the block widget", (t) => {
  const document = installPropertyDOM(t);
  const root = new PropertyElement(document);
  const block = new PropertyElement(document);
  block.dataset.sourceRows = "";
  const extra = new PropertyElement(document);
  extra.dataset.sourceExtra = "";
  extra.hidden = true;
  const button = new PropertyElement(document);
  button.tagName = "BUTTON";
  button.dataset.sourceMore = "";
  block.append(extra);
  block.append(button);
  root.append(block);
  root.findAll = (selector) => {
    if (selector === "[data-source-open]") {
      return [];
    }
    if (selector === "[data-source-more]") {
      return [button];
    }
    return [];
  };
  block.findAll = (selector) =>
    selector === "[data-source-extra]" ? [extra] : [];
  button.nearest = (selector) =>
    selector === "[data-source-rows]" ? block : null;

  let measured = 0;
  const view = {
    requestMeasure() {
      measured += 1;
    },
  } as unknown as EditorView;
  t.mock.method(EditorView, "findFromDOM", () => view);

  bindSources(
    root as unknown as ParentNode,
    new AbortController().signal,
    () => {},
  );
  button.dispatchEvent(new Event("click"));
  assert.equal(measured, 1);
  assert.equal(extra.hidden, false);
  assert.equal(button.isConnected, false);
});
