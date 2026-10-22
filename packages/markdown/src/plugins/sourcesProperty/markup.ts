import { sourceRows } from "../../markdown/okf";
import { escape } from "../../markdown/html/helpers";
import {
  DEFAULT_LIST_PREVIEW_COUNT,
  listPreviewCount as clampPreview,
} from "../../markdown/properties/list-preview";

/** @deprecated Prefer options.previewCount (default properties.listPreviewCount = 3). */
export const FIRST_SOURCE_ROWS = DEFAULT_LIST_PREVIEW_COUNT;

/**
 * Stacked Sources rows with open links. Collapsed sheets emit only the
 * preview window; "Showing N of M" remounts with `expanded: true` so cold
 * open does not parse/insert every hidden article (WorkVault ~100+ Sources).
 */
export function renderSources(
  value: unknown,
  values: Record<string, unknown>,
  options: { expanded?: boolean; previewCount?: number } = {},
): string {
  const rows = sourceRows(value, values);
  const expanded = options.expanded === true;
  const preview = clampPreview(
    options.previewCount ?? DEFAULT_LIST_PREVIEW_COUNT,
  );
  const visible = expanded ? rows : rows.slice(0, preview);
  const body = visible.map((row) => sourceRow(row)).join("");
  const more =
    !expanded && rows.length > preview
      ? `<button type="button" data-source-more>Showing ${preview} of ${rows.length}</button>`
      : "";
  return `<div class="source-rows" data-source-rows>${body}${more}</div>`;
}

function sourceRow(row: ReturnType<typeof sourceRows>[number]): string {
  return `<article class="source-row" data-source-index="${row.index}"><p class="source-title">${escape(row.title || row.resourceLabel)}</p>${resourceLine(row)}${idLine(row)}${usageLine(row)}${metaLine(row)}${rawLine(row)}</article>`;
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
