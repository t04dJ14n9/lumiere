import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EditorView } from "@codemirror/view";
import { reserveUntilMeasured } from "./widget";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/properties/properties.css"),
  "utf8",
).replace(/\s+/g, " ");

test("the sheet's wrapper keeps the sheet's bottom margin, so its measured height counts it", () => {
  // Collapsed through the wrapper, the 2rem margin was missing from the
  // height map: every line number below the sheet sat 32 px off its line.
  assert.match(css, /\.properties \{[^}]*margin-block-end: 2rem;/);
  assert.match(css, /\.hybrid-properties \{[^}]*display: flow-root;/);
});

interface Measure {
  read(): unknown;
  write(value: unknown, view: EditorView): void;
}

function fakeView() {
  const pending: Measure[] = [];
  const view = {
    requestMeasure(measure?: Measure) {
      if (measure && "write" in measure) {
        pending.push(measure);
      }
    },
  } as unknown as EditorView;
  /** CodeMirror's next measure: every read, then every write. */
  const measure = () => {
    const due = pending.splice(0);
    const values = due.map((item) => item.read());
    due.forEach((item, index) => item.write(values[index], view));
  };
  return { view, measure };
}

function sheetElements(height: number) {
  const wrapper = { isConnected: false, style: { minHeight: "" } };
  const sheet = {
    querySelector: () => null,
    getBoundingClientRect: () => ({ height }),
  };
  return {
    wrapper: wrapper as unknown as HTMLElement & { isConnected: boolean },
    sheet: sheet as unknown as HTMLElement,
  };
}

test("a sheet holds its estimated height only until it is measured in the page", () => {
  const { view, measure } = fakeView();
  const { wrapper, sheet } = sheetElements(146);
  reserveUntilMeasured(view, wrapper, sheet, 166);
  assert.equal(wrapper.style.minHeight, "166px", "reserved when built");

  // Built before CodeMirror puts it in the page: the height map needs the
  // estimate until then.
  (wrapper as { isConnected: boolean }).isConnected = true;
  measure();
  assert.equal(
    wrapper.style.minHeight,
    "",
    "released once measured, so a sheet in smaller text is not padded",
  );
});

test("a sheet still out of the page keeps its reserve", () => {
  const { view, measure } = fakeView();
  const { wrapper, sheet } = sheetElements(146);
  reserveUntilMeasured(view, wrapper, sheet, 166);
  measure();
  assert.equal(wrapper.style.minHeight, "166px");
});
