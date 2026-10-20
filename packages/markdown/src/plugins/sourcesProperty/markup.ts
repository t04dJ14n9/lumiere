import { sourceRows } from "../../markdown/okf";
import { escape } from "../../markdown/html/helpers";

export const FIRST_SOURCE_ROWS = 8;

/** Stacked Sources rows with open links. Disclosure never drops a row from the markup. */
export function renderSources(
  value: unknown,
  values: Record<string, unknown>,
  options: { expanded?: boolean } = {},
): string {
  const rows = sourceRows(value, values);
  const expanded = options.expanded === true;
  const body = rows
    .map((row) => sourceRow(row, !expanded && row.index >= FIRST_SOURCE_ROWS))
    .join("");
  const more =
    !expanded && rows.length > FIRST_SOURCE_ROWS
      ? `<button type="button" data-source-more>Showing ${FIRST_SOURCE_ROWS} of ${rows.length}</button>`
      : "";
  return `<div class="source-rows" data-source-rows>${body}${more}</div>`;
}

function sourceRow(
  row: ReturnType<typeof sourceRows>[number],
  extra: boolean,
): string {
  const hidden = extra ? " hidden data-source-extra" : "";
  return `<article class="source-row"${hidden} data-source-index="${row.index}"><p class="source-title">${escape(row.title || row.resourceLabel)}</p>${resourceLine(row)}${idLine(row)}${usageLine(row)}${metaLine(row)}${rawLine(row)}</article>`;
}

function resourceLine(row: ReturnType<typeof sourceRows>[number]): string {
  if (!row.resource) {
    return "";
  }
  if (!row.navigable) {
    return `<p class="source-resource">${escape(row.resource)}</p>`;
  }
  return `<p class="source-resource"><button type="button" data-source-open${attr(row.resource)}>${escape(row.resource)}</button></p>`;
}

function idLine(row: ReturnType<typeof sourceRows>[number]): string {
  if (!row.id) {
    return "";
  }
  return `<p class="source-id">${escape(row.id)}</p>`;
}

function usageLine(row: ReturnType<typeof sourceRows>[number]): string {
  if (row.usageAbsent && !row.usageWindow) {
    return "";
  }
  const count = row.usageAbsent
    ? "usage not recorded"
    : `usage ${row.usageCount}`;
  const window = row.usageWindow
    ? `, window ${row.usageWindow}${row.usageInherited ? " (inherited)" : ""}`
    : "";
  return `<p class="source-usage">${escape(`${count}${window}`)}</p>`;
}

function metaLine(row: ReturnType<typeof sourceRows>[number]): string {
  const parts = [
    row.author ? `author ${row.author}` : "",
    row.lastModified ? `modified ${row.lastModified}` : "",
  ].filter(Boolean);
  return parts.length
    ? `<p class="source-meta">${escape(parts.join(", "))}</p>`
    : "";
}

function rawLine(row: ReturnType<typeof sourceRows>[number]): string {
  return row.raw ? `<pre class="source-raw">${escape(row.raw)}</pre>` : "";
}

function attr(value: string): string {
  return ` data-source-value="${escape(value)}"`;
}
