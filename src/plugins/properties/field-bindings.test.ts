import test from "node:test";
import assert from "node:assert/strict";
import {
  PropertyElement,
  PropertyNativeInput,
  PropertyTextarea,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { bindPropertyFields } from "./fields";
import { bindPropertyLists } from "./lists";

for (const source of ["current", "embedded-note"]) {
  test(`property fields only enable editing for the owning ${source} source`, (t) => {
    const document = installPropertyDOM(t);
    const container = new PropertyElement(document);
    const panel = new PropertyElement(document);
    const checkbox = new PropertyNativeInput(document);
    checkbox.dataset.property = "done";
    const text = new PropertyElement(document);
    text.dataset = { propertyInput: "title", propertyKind: "text" };
    const number = new PropertyNativeInput(document);
    number.dataset = { propertyInput: "count", propertyKind: "number" };
    const date = new PropertyNativeInput(document);
    date.dataset = { propertyInput: "due", propertyKind: "date" };
    const yaml = new PropertyTextarea(document);
    yaml.dataset = { propertyInput: "decision_conf", propertyKind: "yaml" };
    const fields = [text, number, date, yaml];
    container.find = () => panel;
    panel.findAll = (selector) =>
      selector === "input[data-property]" ? [checkbox] : fields;
    bindPropertyFields(
      container as unknown as HTMLElement,
      "---\ntitle: Hello\n---\n",
      {
        source,
        copy: () => {},
        openMenu: () => () => {},
        propertyEditor: { source: "current", set: () => true },
      },
    );
    assert.equal(text.contentEditable, String(source === "current"));
    for (const field of [checkbox, number, date, yaml]) {
      assert.equal(field.disabled, source !== "current");
    }
  });

  test(`list bindings only expose the trailing editor for the owning ${source} source`, (t) => {
    const document = installPropertyDOM(t);
    const container = new PropertyElement(document);
    const list = new PropertyElement(document);
    list.dataset.propertyList = "tags";
    const add = new PropertyElement(document);
    list.find = () => add;
    container.findAll = () => [list];
    const close = bindPropertyLists(
      container as unknown as HTMLElement,
      "---\ntags: []\n---\n",
      {
        source,
        copy: () => {},
        openMenu: () => () => {},
        propertyEditor: { source: "current", set: () => true },
      },
    );
    assert.equal(add.hidden, source !== "current");
    close();
  });
}
