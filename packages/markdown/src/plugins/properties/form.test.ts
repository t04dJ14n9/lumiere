import test from "node:test";
import assert from "node:assert/strict";
import {
  PropertyElement,
  PropertyNativeInput,
  installPropertyDOM,
  propertyKey,
} from "../../../test/support/property-dom";
import { bindPropertyForm } from "./form";
import { frontmatter, propertyChanges } from "../../markdown/properties";

/** Template markup is covered separately; these fakes exercise the form's actual events. */
test("pending rows survive Escape, reject duplicates quietly, and accept a vault name before any YAML write", async (t) => {
  const document = installPropertyDOM(t);
  const panel = new PropertyElement(document);
  const heading = new PropertyElement(document);
  const content = new PropertyElement(document);
  const list = new PropertyElement(document);
  const add = new PropertyElement(document);
  const controls: Record<string, PropertyElement> = {
    "[data-properties-heading]": heading,
    ".metadata-content": content,
    ".metadata-properties": list,
    "[data-property-add]": add,
  };
  panel.find = (selector) => controls[selector] ?? null;
  let wrapperNeeded = false;
  const inputs: PropertyNativeInput[] = [];
  t.mock.method(document, "createElement", (tag: string) => {
    const element = new PropertyElement(document);
    if (tag === "div" && wrapperNeeded) {
      wrapperNeeded = false;
      const row = new PropertyElement(document);
      const key = new PropertyNativeInput(document);
      key.parentElement = new PropertyElement(document);
      row.find = () => key;
      element.children = [row];
      inputs.push(key);
    }
    return element;
  });
  let source = "---\ntitle: Hello\n---\nBody";
  let writes = 0;
  let left = 0;
  const focuses: unknown[] = [];
  const editor = {
    source: "current",
    currentSource: () => source,
    set: () => true,
    edit: () => true,
    names: async () => ["status", "list", "title"],
    focusBody: () => {
      left++;
    },
  };
  bindPropertyForm(
    panel as unknown as HTMLElement,
    editor,
    (operation, key, focusValue) => {
      const changes = propertyChanges(source, operation);
      if (!changes) {
        return false;
      }
      source = changes.reduceRight(
        (text, change) =>
          text.slice(0, change.from) + change.insert + text.slice(change.to),
        source,
      );
      writes++;
      focuses.push([key, focusValue]);
      return true;
    },
  );
  wrapperNeeded = true;
  add.dispatchEvent(new Event("click"));
  await Promise.resolve();
  const first = inputs[0]!;
  first.dispatchEvent(propertyKey("Escape"));
  assert.equal(left, 1);
  assert.equal(list.children.length, 1);
  assert.equal(writes, 0);
  first.value = "title";
  first.focus();
  first.dispatchEvent(new Event("input"));
  first.dispatchEvent(propertyKey("Enter"));
  assert.equal(document.activeElement, first);
  assert.equal(first.value, "title");
  assert.equal(first.validityMessage, "");
  assert.equal(writes, 0);
  wrapperNeeded = true;
  add.dispatchEvent(new Event("click"));
  await Promise.resolve();
  assert.equal(list.children.length, 2);
  const second = inputs[1]!;
  second.value = "st";
  second.dispatchEvent(new Event("input"));
  second.dispatchEvent(propertyKey("Enter"));
  assert.deepEqual(frontmatter(source)?.values, {
    title: "Hello",
    status: null,
  });
  assert.match(source, /\nstatus:\n/);
  assert.equal(writes, 1);
  assert.equal(list.children.length, 1);
  assert.deepEqual(focuses, [["status", true]]);
});

test("Enter on the Properties heading does not toggle collapse (Obsidian)", (t) => {
  const document = installPropertyDOM(t);
  const panel = new PropertyElement(document);
  const heading = new PropertyElement(document);
  const content = new PropertyElement(document);
  const list = new PropertyElement(document);
  const add = new PropertyElement(document);
  const controls: Record<string, PropertyElement> = {
    "[data-properties-heading]": heading,
    ".metadata-content": content,
    ".metadata-properties": list,
    "[data-property-add]": add,
  };
  panel.find = (selector) => controls[selector] ?? null;
  const collapsedCalls: boolean[] = [];
  const editor = {
    source: "current",
    currentSource: () => "---\ntitle: A\n---\n",
    set: () => true,
    edit: () => true,
    names: async () => [],
    focusBody: () => {},
    setCollapsed: (value: boolean) => {
      collapsedCalls.push(value);
    },
  };
  bindPropertyForm(panel as unknown as HTMLElement, editor, () => false);
  heading.dispatchEvent(propertyKey("Enter"));
  assert.deepEqual(collapsedCalls, []);
  heading.dispatchEvent(propertyKey("ArrowLeft"));
  assert.deepEqual(collapsedCalls, [true]);
});
