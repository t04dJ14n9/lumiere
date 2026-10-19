import { parseTable, type Table } from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";

interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

/** Normalize every cell while preserving anchors inside unchanged cell contents. */
export function tableSourceChanges(
  table: Table,
  source: string,
): SourceChange[] {
  const next = parseTable(source);
  const beforeLines = sourceLines(table.source);
  const afterLines = sourceLines(source);
  if (
    !next ||
    beforeLines.length !== afterLines.length ||
    table.alignments.length !== next.alignments.length
  ) {
    return sourceChanges(table.source, source, 0);
  }
  return beforeLines.flatMap((line, index) => {
    const before = cellCuts(table, line, index);
    const after = cellCuts(next, afterLines[index]!, index);
    return before
      .slice(1)
      .flatMap((end, part) =>
        sourceChanges(
          table.source.slice(before[part], end),
          source.slice(after[part], after[part + 1]),
          before[part]!,
        ),
      );
  });
}

function sourceLines(source: string): { from: number; to: number }[] {
  let from = 0;
  return source.split("\n").map((text) => {
    const line = { from, to: from + text.length };
    from = line.to + 1;
    return line;
  });
}

function cellCuts(
  table: Table,
  line: { from: number; to: number },
  index: number,
): number[] {
  // The model excludes the delimiter line from its rows.
  const row = index === 0 ? table.rows[0] : table.rows[index - 1];
  if (index === 1 || !row) {
    return [line.from, line.to];
  }
  // Formatting spaces and delimiters must not replace unrelated cell text:
  // native selection mapping and concurrent panel edits depend on its identity.
  return [
    line.from,
    ...row.flatMap((cell) => [cell.rawFrom, cell.from, cell.to, cell.rawTo]),
    line.to,
  ];
}

function sourceChanges(
  before: string,
  after: string,
  offset: number,
): SourceChange[] {
  const changes: SourceChange[] = [];
  difference(before, after).iterChanges((...change) => {
    const [from, to, , , insert] = change;
    changes.push({
      from: offset + from,
      to: offset + to,
      insert: insert.toString(),
    });
  });
  return changes;
}
