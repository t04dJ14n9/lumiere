import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  type PropertyDocument,
  PropertyElement,
  PropertyNativeInput,
  installPropertyDOM,
} from "../../../test/support/property-dom";
import { reconcileProperties, rememberPropertyRows } from "./sheet";

function tagRow(document: PropertyDocument, tags: string[]): PropertyElement {
  const row = new PropertyElement(document);
  row.dataset.propertyRow = "tags";
  Object.defineProperty(row, "outerHTML", { value: JSON.stringify(tags) });
  const chips = tags.map((tag) => {
    const chip = new PropertyElement(document);
    chip.textContent = tag;
    return chip;
  });
  const name = new PropertyNativeInput(document);
  name.value = "tags";
  const type = new PropertyElement(document);
  row.find = (selector) => {
    if (selector === "[data-property-name]") {
      return name;
    }
    if (selector === "button[data-property-type]") {
      return type;
    }
    return null;
  };
  row.findAll = (selector) =>
    selector === "[data-property-chip]" ? chips : [];
  return row;
}

/** Row fixtures isolate reconciliation; the browser suite covers parsing and focus. */
function sheetFixture(t: TestContext, attribute: string, text: string) {
  const document = installPropertyDOM(t);
  // This narrow DOM is unsupported by DOMPurify, which leaves template HTML alone.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      document: Object.assign(document, { nodeType: 9 }),
      Element: PropertyElement,
    },
  });
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
  const container = new PropertyElement(document);
  const panel = new PropertyElement(document);
  const list = new PropertyElement(document);
  const previous = tagRow(document, ["one", "two"]);
  const next = tagRow(document, ["one"]);
  list.append(previous);
  Object.assign(list, {
    insertBefore: (row: PropertyElement) => list.append(row),
  });
  const active = new PropertyElement(document);
  active.tagName = attribute === "data-property-remove" ? "BUTTON" : "DIV";
  active.setAttribute(attribute, "1");
  active.textContent = text;
  active.nearest = (selector) => {
    if (selector === "[data-property-row]") {
      return previous;
    }
    return selector === "[data-property-list]" ? list : null;
  };
  active.focus();
  panel.contains = (element) => element === active;
  const controls: Record<string, PropertyElement> = {
    ".metadata-properties": list,
    "[data-properties-heading]": new PropertyElement(document),
    "[data-property-add]": new PropertyElement(document),
    ".property-message": new PropertyElement(document),
  };
  panel.find = (selector) => controls[selector] ?? null;
  panel.findAll = (selector) =>
    selector === "[data-property-row]" ? list.children : [];
  container.find = (selector) =>
    selector === ":scope > .properties" ? panel : null;
  container.findAll = (selector) =>
    selector === "[data-property-row]" ? list.children : [];
  const fresh = new PropertyElement(document);
  fresh.findAll = (selector) =>
    selector === "[data-property-row]" ? [next] : [];
  t.mock.method(document, "createElement", () => fresh);
  rememberPropertyRows(container as unknown as HTMLElement);
  return { container, list, previous, next, active, fresh };
}

test("a focused chip remove button lets reconciliation replace the removed tag", (t) => {
  const { container, list, previous, next, active, fresh } = sheetFixture(
    t,
    "data-property-remove",
    "×",
  );
  assert.equal(active.ownerDocument.activeElement, active);
  assert.equal(previous.querySelectorAll("[data-property-chip]").length, 2);
  assert.equal(
    reconcileProperties(
      container as unknown as HTMLElement,
      "---\ntags: [one]\n---\n",
      { source: "current", copy: () => {}, openMenu: () => () => {} },
    ),
    true,
  );
  assert.match(fresh.innerHTML, /data-tag="one"/);
  assert.doesNotMatch(fresh.innerHTML, /data-tag="two"/);
  assert.equal(list.firstElementChild, next);
  assert.equal(previous.isConnected, false);
  assert.deepEqual(
    list.firstElementChild
      ?.querySelectorAll("[data-property-chip]")
      .map((chip) => chip.textContent),
    ["one"],
  );
});

for (const attribute of [
  "data-property-list-input",
  "data-property-chip-edit",
]) {
  test(`reconciliation preserves a nonempty ${attribute} draft`, (t) => {
    const { container, list, previous, active } = sheetFixture(
      t,
      attribute,
      "draft",
    );
    reconcileProperties(
      container as unknown as HTMLElement,
      "---\ntags: [one]\n---\n",
      { source: "current", copy: () => {}, openMenu: () => () => {} },
    );
    assert.equal(list.firstElementChild, previous);
    assert.equal(previous.isConnected, true);
    assert.equal(active.ownerDocument.activeElement, active);
    assert.equal(active.textContent, "draft");
  });
}
