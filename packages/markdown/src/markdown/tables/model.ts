export interface Cell {
  text: string;
  from: number;
  to: number;
  rawFrom: number;
  rawTo: number;
  missing?: boolean;
}

export interface Table {
  rows: Cell[][];
  alignments: ("left" | "center" | "right" | null)[];
  source: string;
}

export interface CellPosition {
  row: number;
  column: number;
}
export interface CellRange {
  anchor: CellPosition;
  head: CellPosition;
}

/** Pipes preceded by an odd number of backslashes belong to the cell. */
function boundaries(line: string): number[] {
  const result: number[] = [];
  let escapes = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "|" && escapes % 2 === 0) {
      result.push(index);
    }
    escapes = char === "\\" ? escapes + 1 : 0;
  }
  return result;
}

function cells(line: string, offset: number): Cell[] {
  const pipes = boundaries(line);
  let start = 0;
  let end = line.length;
  if (pipes[0] !== undefined && !line.slice(0, pipes[0]).trim()) {
    start = pipes.shift()! + 1;
  }
  const last = pipes.at(-1);
  if (last !== undefined && !line.slice(last + 1).trim()) {
    end = last;
    pipes.pop();
  }
  const cuts = [start - 1, ...pipes, end];
  return cuts.slice(1).map((cut, index) => {
    const rawFrom = cuts[index]! + 1;
    const raw = line.slice(rawFrom, cut);
    const from = rawFrom + raw.length - raw.trimStart().length;
    const to = Math.max(from, cut - (raw.length - raw.trimEnd().length));
    return {
      text: line.slice(from, to),
      from: offset + from,
      to: offset + to,
      rawFrom: offset + rawFrom,
      rawTo: offset + cut,
    };
  });
}

export function parseTable(source: string): Table | undefined {
  const lines = source.split("\n");
  if (lines.length < 2 || boundaries(lines[0]!).length === 0) {
    return undefined;
  }
  const header = cells(lines[0]!, 0);
  const divider = cells(lines[1]!, lines[0]!.length + 1);
  if (
    header.length < 1 ||
    divider.length !== header.length ||
    divider.some((cell) => !/^:?-+:?$/.test(cell.text))
  ) {
    return undefined;
  }
  const alignments = divider.map((cell) => {
    const left = cell.text.startsWith(":");
    const right = cell.text.endsWith(":");
    if (left && right) {
      return "center" as const;
    }
    if (left) {
      return "left" as const;
    }
    return right ? ("right" as const) : null;
  });
  const rows = [header];
  let offset = lines[0]!.length + lines[1]!.length + 2;
  for (const line of lines.slice(2)) {
    if (!line.trim()) {
      break;
    }
    const row = cells(line, offset).slice(0, header.length);
    while (row.length < header.length) {
      row.push({
        text: "",
        from: offset + line.length,
        to: offset + line.length,
        rawFrom: offset + line.length,
        rawTo: offset + line.length,
        missing: true,
      });
    }
    rows.push(row);
    offset += line.length + 1;
  }
  return { source, rows, alignments };
}

/** Add only the delimiters needed to represent an omitted trailing cell. */
export function materializeCell(
  table: Table,
  position: CellPosition,
  text: string,
): { from: number; insert: string } {
  const row = table.rows[position.row]!;
  const cell = row[position.column]!;
  const firstMissing = row.findIndex((entry) => entry.missing);
  if (!cell.missing || firstMissing < 0) {
    throw new Error("Only omitted cells need materialization.");
  }
  const previous = row[firstMissing - 1];
  const closed = previous && previous.rawTo < cell.from;
  return {
    from: cell.from,
    insert:
      (closed ? "" : " |") +
      "  |".repeat(position.column - firstMissing) +
      ` ${cellText(text)} |`,
  };
}

export function rectangle(range: CellRange) {
  return {
    top: Math.min(range.anchor.row, range.head.row),
    bottom: Math.max(range.anchor.row, range.head.row),
    left: Math.min(range.anchor.column, range.head.column),
    right: Math.max(range.anchor.column, range.head.column),
  };
}

export function cellText(text: string): string {
  let result = "";
  let escapes = 0;
  for (const char of text.replace(/\r\n?|\n/g, "<br>")) {
    if (char === "|" && escapes % 2 === 0) {
      result += "\\";
    }
    result += char;
    escapes = char === "\\" ? escapes + 1 : 0;
  }
  return result;
}

/** Padding belongs to the column; whitespace typed in a cell belongs to its text. */
export function cellPadding(
  text: string,
  width: number,
  alignment: Table["alignments"][number],
): { before: number; after: number } {
  const extra = Math.max(0, width - text.length);
  let before = 0;
  if (alignment === "right") {
    before = extra;
  } else if (alignment === "center") {
    before = Math.floor(extra / 2);
  }
  return { before, after: extra - before };
}

/** Structural edits normalize table layout in one outer-document transaction. */
export function serializeTable(
  rows: readonly (readonly string[])[],
  alignments: Table["alignments"],
): string {
  const width = alignments.length;
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, column) => cellText(row[column] ?? "")),
  );
  const lengths = Array.from({ length: width }, (_, column) =>
    Math.max(3, ...normalized.map((row) => row[column]!.length)),
  );
  const rowText = (row: readonly string[]) =>
    `| ${row
      .map((text, column) => {
        const padding = cellPadding(
          text,
          lengths[column]!,
          alignments[column]!,
        );
        return " ".repeat(padding.before) + text + " ".repeat(padding.after);
      })
      .join(" | ")} |`;
  const divider = alignments.map((alignment, column) => {
    const length = lengths[column]!;
    if (alignment === "center") {
      return ":" + "-".repeat(Math.max(1, length - 2)) + ":";
    }
    if (alignment === "left") {
      return ":" + "-".repeat(length - 1);
    }
    if (alignment === "right") {
      return "-".repeat(length - 1) + ":";
    }
    return "-".repeat(length);
  });
  return [
    rowText(normalized[0] ?? Array(width).fill("")),
    rowText(divider),
    ...normalized.slice(1).map(rowText),
  ].join("\n");
}

/** The source text of each cell in a range, row by row. */
export function rangeTexts(table: Table, range: CellRange): string[][] {
  const area = rectangle(range);
  return table.rows
    .slice(area.top, area.bottom + 1)
    .map((row) =>
      row.slice(area.left, area.right + 1).map((cell) => cell.text),
    );
}

/** Tab-separated cells, as spreadsheets copy them. */
export function copyCells(table: Table, range: CellRange): string {
  return rangeTexts(table, range)
    .map((row) => row.map((text) => text.replace(/\\\|/g, "|")).join("\t"))
    .join("\n");
}

/** Plain cell texts for a range (pipes unescaped), as Obsidian `obsidian/table` rows. */
export function copyCellsRows(table: Table, range: CellRange): string[][] {
  return rangeTexts(table, range).map((row) =>
    row.map((text) => text.replace(/\\\|/g, "|")),
  );
}

/**
 * Markdown table fragment for the selection (first row as header + alignment
 * line), matching Obsidian `getTableString` / `text/markdown` on copy.
 */
export function copyCellsMarkdown(table: Table, range: CellRange): string {
  const area = rectangle(range);
  const rows = copyCellsRows(table, range);
  const alignments = table.alignments.slice(area.left, area.right + 1);
  return serializeTable(rows, alignments);
}

/** Simple HTML table for `text/html` (Obsidian uses markdown→HTML; we emit a table). */
export function copyCellsHtml(table: Table, range: CellRange): string {
  const rows = copyCellsRows(table, range);
  const escape = (value: string): string =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const body = rows
    .map((row, index) => {
      const tag = index === 0 ? "th" : "td";
      return (
        "<tr>" +
        row.map((cell) => `<${tag}>${escape(cell)}</${tag}>`).join("") +
        "</tr>"
      );
    })
    .join("");
  return `<!-- lumiere-table -->\n<table>\n${body}\n</table>`;
}

/** Obsidian-compatible structured payload (`obsidian/table`). */
export function copyCellsObsidian(
  table: Table,
  range: CellRange,
): { rows: string[][]; alignment: string[] } {
  const area = rectangle(range);
  return {
    rows: copyCellsRows(table, range),
    alignment: table.alignments
      .slice(area.left, area.right + 1)
      .map((alignment) => alignment ?? ""),
  };
}

/** Parse a markdown table fragment into cell rows (skips the alignment line). */
export function pastedMarkdownCells(text: string): string[][] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .split("\n")
    .filter((line) => line.includes("|"));
  const rows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Alignment / divider row: only pipes, colons, dashes and spaces.
    if (/^\|?[\s:-]+\|?[\s|:-]*$/.test(trimmed) && /-/.test(trimmed)) {
      continue;
    }
    let body = trimmed;
    if (body.startsWith("|")) {
      body = body.slice(1);
    }
    if (body.endsWith("|")) {
      body = body.slice(0, -1);
    }
    rows.push(body.split("|").map((cell) => cell.trim().replace(/\\\|/g, "|")));
  }
  return rows.length > 0 ? rows : [[text]];
}

/** Split tab-separated clipboard text into rows of cell values. */
export function pastedCells(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

/** Wrap a cell in an inline marker, or unwrap it if already wrapped. */
export function toggleMarker(text: string, marker: string): string {
  if (!text) {
    return "";
  }
  return text.startsWith(marker) &&
    text.endsWith(marker) &&
    text.length >= marker.length * 2
    ? text.slice(marker.length, -marker.length)
    : marker + text + marker;
}

/** The cell whose raw source, including padding, contains an offset. */
export function cellAtOffset(
  table: Table,
  offset: number,
): CellPosition | undefined {
  for (let row = 0; row < table.rows.length; row++) {
    const column = table.rows[row]!.findIndex(
      (cell) => cell.rawFrom <= offset && offset <= cell.rawTo,
    );
    if (column >= 0) {
      return { row, column };
    }
  }
  return undefined;
}

/** Source entry follows the measured Vim pipe ownership, including its delimiter quirk. */
export function cellForSourceOffset(
  table: Table,
  offset: number,
): { position: CellPosition; offset: number } | undefined {
  if (offset < 0 || offset > table.source.length) {
    return undefined;
  }
  const line = table.source.slice(0, offset).split("\n").length - 1;
  // A delimiter-line landing opens the last row's first cell, regardless of column.
  if (line === 1) {
    return { position: { row: table.rows.length - 1, column: 0 }, offset: 0 };
  }
  const row = line === 0 ? 0 : line - 1;
  const cells = table.rows[row];
  const first = cells?.[0];
  const last = cells?.at(-1);
  if (!cells || !first || !last) {
    return undefined;
  }
  // The leading and final pipes belong to no cell; Obsidian falls back to column zero.
  if (offset < first.rawFrom || offset >= last.rawTo) {
    return { position: { row, column: 0 }, offset: 0 };
  }
  const column = cells.findIndex(
    (cell) => cell.rawFrom <= offset && offset <= cell.rawTo,
  );
  const cell = cells[column];
  if (!cell) {
    return { position: { row, column: 0 }, offset: 0 };
  }
  return {
    position: { row, column },
    offset: Math.max(0, Math.min(cell.text.length, offset - cell.from)),
  };
}

export function writeCells(
  table: Table,
  range: CellRange,
  values: readonly (readonly string[])[],
): string {
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  const alignments = [...table.alignments];
  const area = rectangle(range);
  const repeat = values.length === 1 && values[0]?.length === 1;
  const height = repeat ? area.bottom - area.top + 1 : values.length;
  const width = repeat
    ? area.right - area.left + 1
    : Math.max(0, ...values.map((row) => row.length));
  while (alignments.length < area.left + width) {
    alignments.push(null);
  }
  while (rows.length < area.top + height) {
    rows.push([]);
  }
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      rows[area.top + row]![area.left + column] =
        values[repeat ? 0 : row]?.[repeat ? 0 : column] ?? "";
    }
  }
  return serializeTable(rows, alignments);
}

export function insertRow(table: Table, after: number): string {
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  rows.splice(
    Math.max(1, after + 1),
    0,
    Array<string>(table.alignments.length).fill(""),
  );
  return serializeTable(rows, table.alignments);
}

export function insertColumn(table: Table, after: number): string {
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  const alignments = [...table.alignments];
  alignments.splice(after + 1, 0, null);
  for (const row of rows) {
    row.splice(after + 1, 0, "");
  }
  return serializeTable(rows, alignments);
}
