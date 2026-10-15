import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import {
  installPropertyDOM,
  PropertyElement,
} from "../../../test/support/property-dom";
import { PropertySelection } from "./selection";

function selectedSourceId(t: TestContext) {
  const document = installPropertyDOM(t);
  const panel = new PropertyElement(document);
  const row = new PropertyElement(document);
  row.dataset.propertyRow = "sources";
  panel.findAll = () => [row];
  row.focus();
  const sources = [{ resource: "../raw/paper.pdf", id: "source-01" }];
  const values: Record<string, unknown> = { sources, title: "Note" };
  const removed: string[][] = [];
  const selection = new PropertySelection(panel as unknown as HTMLElement, {
    values: () => values,
    remove(keys) {
      removed.push(keys);
      keys.forEach((key) => delete values[key]);
      return true;
    },
    merge() {},
  });
  let selectedText = "source-01";
  t.mock.method(document, "getSelection", () => ({
    get isCollapsed() {
      return selectedText.length === 0;
    },
    toString: () => selectedText,
    removeAllRanges() {
      selectedText = "";
    },
    addRange() {},
  }));
  const clipboard = new Map<string, string>();
  const nativeCopy = (type = "copy") => {
    clipboard.clear();
    const event = Object.assign(new Event(type, { cancelable: true }), {
      clipboardData: {
        setData: (format: string, value: string) =>
          clipboard.set(format, value),
      },
    });
    panel.dispatchEvent(event);
    if (!event.defaultPrevented) {
      clipboard.set("text/plain", selectedText);
    }
    return event;
  };
  t.mock.method(document, "execCommand", (command?: string) => {
    assert.equal(command, "copy");
    nativeCopy();
    return true;
  });
  return { selection, clipboard, values, removed, nativeCopy, sources };
}

for (const action of ["copy", "cut"] as const) {
  test(`row ${action} with selected id text copies the full property payload`, (t) => {
    const { selection, clipboard, values, removed, sources } =
      selectedSourceId(t);
    assert.equal(selection[action](["sources"]), true);
    assert.deepEqual(parse(clipboard.get("text/plain")!), { sources });
    assert.deepEqual(JSON.parse(clipboard.get("obsidian/properties")!), {
      sources,
    });
    assert.equal(values.title, "Note");
    if (action === "cut") {
      assert.equal(Object.hasOwn(values, "sources"), false);
      assert.deepEqual(removed, [["sources"]]);
    } else {
      assert.deepEqual(values.sources, sources);
      assert.deepEqual(removed, []);
    }
  });
}

for (const type of ["copy", "cut"]) {
  test(`native ${type} with selected id text keeps the native clipboard payload`, (t) => {
    const { clipboard, values, removed, nativeCopy, sources } =
      selectedSourceId(t);
    const event = nativeCopy(type);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual([...clipboard], [["text/plain", "source-01"]]);
    assert.deepEqual(values.sources, sources);
    assert.deepEqual(removed, []);
  });
}
