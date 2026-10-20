import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { parseTable, type CellRange } from "../../markdown/tables/model";
import { TableClipboard } from "./clipboard";
import { TableSelection } from "./selection";
import type { CellProjection } from "./projection";
import type { TableGrid } from "./grid";

const source = "| a | b |\n| --- | ---: |\n| first | second |";

function clipboardFixture() {
  let state = EditorState.create({
    doc: "first",
    selection: { anchor: 1, head: 4 },
  });
  const inner = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
  } as EditorView;
  const grid = {
    block: { source },
    model: parseTable(source)!,
    root: { isConnected: true, focus() {} },
    outer: { focus() {} },
    replace(next: string) {
      grid.block.source = next;
      grid.model = parseTable(next)!;
    },
  } as unknown as TableGrid;
  const projection = { inner, active: { row: 1, column: 0 } } as CellProjection;
  const selection = {
    range: undefined as CellRange | undefined,
  } as TableSelection;
  const copied: string[] = [];
  let read: () => Promise<string> = async () => "pasted";
  const clipboard = new TableClipboard(grid, projection, selection, {
    copy: (text) => {
      copied.push(text);
    },
    paste: () => read(),
    wrap: () => false,
    clearFormatting: (text) => text,
    canFormat: false,
  });
  return {
    clipboard,
    inner,
    grid,
    copied,
    selection,
    setRead(reader: () => Promise<string>) {
      read = reader;
    },
  };
}

test("cell clipboard menu copies and cuts selected raw text and pastes at the selection", async () => {
  const fixture = clipboardFixture();
  const position = { row: 1, column: 0 };
  const range = { anchor: position, head: position };
  fixture.clipboard.copyFromMenu(range, false);
  assert.deepEqual(fixture.copied, ["irs"]);
  fixture.clipboard.copyFromMenu(range, true);
  assert.equal(fixture.inner.state.doc.toString(), "ft");
  await fixture.clipboard.pasteFromMenu(range);
  assert.equal(fixture.inner.state.doc.toString(), "fpastedt");
  assert.equal(fixture.clipboard.canFormat, false);
});

test("delayed clipboard paste refuses a changed table or cell selection", async () => {
  for (const change of ["table", "selection"] as const) {
    const fixture = clipboardFixture();
    let complete: (text: string) => void = () => {};
    fixture.setRead(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const position = { row: 1, column: 0 };
    const paste = fixture.clipboard.pasteFromMenu({
      anchor: position,
      head: position,
    });
    if (change === "table") {
      fixture.grid.block = {
        ...fixture.grid.block,
        source: source.replace("first", "changed"),
      };
    } else {
      fixture.inner.dispatch({ selection: { anchor: 0 } });
    }
    complete("late reply");
    await assert.rejects(paste, /changed before paste completed/);
    assert.equal(fixture.inner.state.doc.toString(), "first");
  }
});

test("Select all selects cell text while editing and the entire grid while selecting cells", () => {
  const fixture = clipboardFixture();
  let selected: CellRange | undefined;
  const selection = {
    projection: { inner: fixture.inner },
    grid: fixture.grid,
    range: undefined as CellRange | undefined,
    select(range: CellRange) {
      selected = range;
    },
  } as unknown as TableSelection;
  TableSelection.prototype.selectAll.call(selection);
  assert.equal(fixture.inner.state.selection.main.from, 0);
  assert.equal(fixture.inner.state.selection.main.to, 5);
  selection.range = {
    anchor: { row: 1, column: 0 },
    head: { row: 1, column: 1 },
  };
  TableSelection.prototype.selectAll.call(selection);
  assert.deepEqual(selected, {
    anchor: { row: 0, column: 0 },
    head: { row: 1, column: 1 },
  });
});

for (const modifier of ["ctrlKey", "metaKey"] as const) {
  test(`${modifier}+C copies a grid column through the host without changing selection or text`, () => {
    const fixture = clipboardFixture();
    fixture.selection.range = {
      anchor: { row: 0, column: 1 },
      head: { row: 1, column: 1 },
    };
    const range = fixture.selection.range;
    let prevented = false;
    let stopped = false;
    const event = {
      key: "c",
      [modifier]: true,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    } as unknown as KeyboardEvent;
    fixture.clipboard.keyDown(event);
    assert.deepEqual(fixture.copied, ["b\nsecond"]);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(fixture.selection.range, range);
    assert.equal(fixture.grid.block.source, source);
  });
}

test("copy shortcut leaves cell text and unrelated shortcuts to their editors", () => {
  const fixture = clipboardFixture();
  fixture.clipboard.keyDown({
    key: "c",
    ctrlKey: true,
  } as unknown as KeyboardEvent);
  fixture.selection.range = {
    anchor: { row: 0, column: 0 },
    head: { row: 1, column: 1 },
  };
  for (const extra of [
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
    { defaultPrevented: true },
  ]) {
    fixture.clipboard.keyDown({
      key: "c",
      ctrlKey: true,
      ...extra,
    } as unknown as KeyboardEvent);
  }
  fixture.clipboard.keyDown({ key: "c" } as unknown as KeyboardEvent);
  assert.deepEqual(fixture.copied, []);
});

test("ClipboardEvent copy sets plain TSV, markdown, HTML and obsidian/table", () => {
  const fixture = clipboardFixture();
  const range = {
    anchor: { row: 1, column: 0 },
    head: { row: 1, column: 1 },
  };
  fixture.selection.range = range;
  const data = new Map<string, string>();
  const event = {
    preventDefault() {},
    clipboardData: {
      setData(type: string, value: string) {
        data.set(type, value);
      },
      getData(type: string) {
        return data.get(type) ?? "";
      },
    },
  } as unknown as ClipboardEvent;
  fixture.clipboard.copy(event, false);
  assert.equal(data.get("text/plain"), "first\tsecond");
  assert.match(data.get("text/markdown")!, /\| first/);
  // Selection is treated as a mini-table: first selected row uses <th>.
  assert.match(data.get("text/html")!, /<th>first<\/th><th>second<\/th>/);
  const structured = JSON.parse(data.get("obsidian/table")!);
  assert.deepEqual(structured.rows, [["first", "second"]]);
  assert.deepEqual(structured.alignment, ["", "right"]);
});

test("paste prefers obsidian/table rows over plain text", () => {
  const fixture = clipboardFixture();
  const range = {
    anchor: { row: 1, column: 0 },
    head: { row: 1, column: 1 },
  };
  fixture.selection.range = range;
  const event: {
    defaultPrevented: boolean;
    clipboardData: { getData(type: string): string };
    preventDefault(): void;
  } = {
    defaultPrevented: false,
    clipboardData: {
      getData(type: string) {
        if (type === "obsidian/table") {
          return JSON.stringify({
            rows: [["Zed", "99"]],
            alignment: ["", "right"],
          });
        }
        return "ignored\ttext";
      },
    },
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  fixture.clipboard.paste(event as unknown as ClipboardEvent);
  assert.match(fixture.grid.block.source, /Zed/);
  assert.match(fixture.grid.block.source, /99/);
  assert.doesNotMatch(fixture.grid.block.source, /ignored/);
});
