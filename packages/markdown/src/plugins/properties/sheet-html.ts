import {
  frontmatter,
  matchesPropertyKind,
  settablePropertyValue,
} from "../../markdown/properties";
import { propertyYamlDraft } from "../../markdown/properties/yaml-draft";
import {
  DEFAULT_LIST_PREVIEW_COUNT,
  listPreviewCount as clampPreview,
} from "../../markdown/properties/list-preview";
import {
  inferPropertyKind,
  propertyKindLabels,
} from "../../markdown/properties/types";
import type {
  PropertyKind,
  PropertyTypes,
} from "../../markdown/properties/types";
import { propertyIcon, propertyFlairIcon } from "../../webview/ui/icons";
import { validTag } from "../../markdown/tags/grammar";
import { attr, escape } from "../../markdown/html/helpers";
import { createRenderer } from "../../markdown/html";

/** Defer markdown-it plugin setup until a wiki-link value needs inline HTML. */
let renderInlineFn: ((source: string) => string) | undefined;
function renderInline(source: string): string {
  renderInlineFn ??= createRenderer().renderInline;
  return renderInlineFn(source);
}

interface PropertyRowOptions {
  kind: PropertyKind;
  editable: boolean;
  custom: string | undefined;
  draft: string | undefined;
  listPreviewCount: number;
  listExpanded: boolean;
}

export function renderProperties(
  source: string,
  types: PropertyTypes = {},
  options: {
    collapsed?: boolean;
    allowEmpty?: boolean;
    listPreviewCount?: number;
    expandedLists?: ReadonlySet<string>;
    renderValue?(
      key: string,
      value: unknown,
      values: Record<string, unknown>,
    ): string | undefined;
  } = {},
): string {
  const properties = frontmatter(source);
  if (!properties && !options.allowEmpty) {
    return "";
  }
  if (properties?.error) {
    return `<div class="render-error">${escape(properties.error)}</div><pre>${escape(properties.raw)}</pre>`;
  }
  const preview = clampPreview(
    options.listPreviewCount ?? DEFAULT_LIST_PREVIEW_COUNT,
  );
  const expandedLists = options.expandedLists ?? new Set<string>();
  const values = properties?.values ?? {};
  const rows = Object.entries(values)
    .map(([key, value]) =>
      propertyRow(key, value, {
        kind: inferPropertyKind(key, value, types),
        editable:
          settablePropertyValue(value) &&
          !!(
            properties?.editableKeys?.includes(key) ||
            properties?.editableLists?.includes(key)
          ),
        custom: options.renderValue?.(key, value, values),
        draft: propertyYamlDraft(
          properties?.yaml?.body ?? "",
          properties?.yaml?.document.get(key, true),
          value,
          properties?.yaml?.document,
        ),
        listPreviewCount: preview,
        listExpanded: expandedLists.has(key),
      }),
    )
    .join("");
  return `<div class="properties metadata-container${options.collapsed ? " is-collapsed" : ""}"><div class="metadata-properties-heading" data-properties-heading tabindex="0" role="button" aria-expanded="${!options.collapsed}"><span class="metadata-collapse-indicator collapse-indicator collapse-icon">${propertyFlairIcon("collapse")}</span><span class="metadata-properties-title">Properties</span></div><div class="metadata-content"${options.collapsed ? " hidden" : ""}><div class="metadata-properties">${rows}</div><button type="button" class="metadata-add-button text-icon-button" data-property-add>${propertyFlairIcon("plus")} Add property</button></div><p class="property-message" aria-live="polite"></p></div>`;
}

function propertyBody(
  key: string,
  value: unknown,
  options: PropertyRowOptions,
): string {
  // OKF Sources (and other custom renderers): typed stacked UI with an on-demand YAML editor when draftable.
  if (options.custom) {
    if (options.draft !== undefined) {
      return `<div class="property-complex" data-property-display>${options.custom}<button type="button" tabindex="-1" class="metadata-property-link-flair property-complex-edit" data-property-edit${attr("aria-label", `Edit ${key}`)}>${propertyFlairIcon("pencil")}</button></div>${editableYaml(key, options.draft).replace("<textarea ", "<textarea hidden ")}`;
    }
    return `<div class="property-complex">${options.custom}</div>`;
  }
  if (options.editable) {
    return editableValue(key, value, options);
  }
  // OKF generated / verified (map or list of {by,at}) — typed actor+time.
  if (options.draft !== undefined && isOkfProvenance(key, value)) {
    return Array.isArray(value)
      ? okfVerifiedListValue(value)
      : okfProvenanceValue(value);
  }
  // Nested non-OKF (incl. decision_confirmation): Obsidian Unknown + JSON.
  if (options.draft !== undefined && isUnknownPropertyValue(value)) {
    return unknownPropertyValue(value);
  }
  // Draftable scalars/collections that are not Unknown still use YAML editors
  // (e.g. block-scalar text that is not in editableKeys).
  if (options.draft !== undefined) {
    return editableYaml(key, options.draft);
  }
  return complexFallback(options.draft);
}

function propertyTypeMeta(
  key: string,
  value: unknown,
  options: PropertyRowOptions,
): { okf: boolean; unknown: boolean; typeLabel: string; typeName: string } {
  const { kind } = options;
  const okf =
    !options.custom &&
    !options.editable &&
    options.draft !== undefined &&
    isOkfProvenance(key, value);
  const unknown =
    !options.custom &&
    !options.editable &&
    !okf &&
    options.draft !== undefined &&
    isUnknownPropertyValue(value);
  let typeLabel = propertyKindLabels[kind];
  let typeName: string = kind === "list" ? "multitext" : kind;
  if (options.custom && key.toLowerCase() === "sources") {
    typeLabel = "Sources";
    typeName = "sources";
  } else if (okf) {
    const name = key.toLowerCase();
    typeLabel = name === "verified" ? "Verified" : "Generated";
    typeName = name === "verified" ? "verified" : "generated";
  } else if (unknown) {
    typeLabel = "Unknown";
    typeName = "unknown";
  }
  return { okf, unknown, typeLabel, typeName };
}

function propertyRow(
  key: string,
  value: unknown,
  options: PropertyRowOptions,
): string {
  const { kind } = options;
  const { okf, unknown, typeLabel, typeName } = propertyTypeMeta(
    key,
    value,
    options,
  );
  const warning = mismatchWarning(
    kind,
    !unknown && !okf && !matchesPropertyKind(kind, value),
  );
  const body = propertyBody(key, value, options);
  const icon = propertyIcon(key, value, unknown ? "unknown" : kind);
  return `<div class="property-row metadata-property" tabindex="0"${attr("data-property-row", key)}${attr("data-property-key", key)}><div class="metadata-property-key"><button type="button" tabindex="-1" data-property-type${attr("aria-label", `Type of ${key}: ${typeLabel}`)}><span class="metadata-property-icon">${icon}</span></button><input class="property-key metadata-property-key-input" tabindex="-1"${attr("data-property-name", key)}${attr("aria-label", `Property name: ${key}`)}${attr("title", key)}${attr("value", key)}></div><div class="metadata-property-value"${attr("data-property-type", typeName)}>${body}</div>${warning}</div>`;
}

export function pendingPropertyRow(): string {
  return `<div class="property-row metadata-property" data-property-new tabindex="0"><div class="metadata-property-key"><span class="metadata-property-icon">${propertyIcon("", null)}</span><input class="property-key metadata-property-key-input" aria-label="New property name" placeholder="Property name" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"></div><div class="metadata-property-value"><span class="property-empty">Empty</span></div></div>`;
}

function mismatchWarning(kind: PropertyKind, hasMismatch: boolean): string {
  const label = `Type mismatch, expected ${propertyKindLabels[kind]}`;
  return `<span class="property-type-warning metadata-property-warning-icon"${hasMismatch ? "" : " hidden"} role="img"${attr("aria-label", label)}${attr("title", label)}>${propertyFlairIcon("warning")}</span>`;
}

function editableValue(
  key: string,
  value: unknown,
  options: PropertyRowOptions,
): string {
  const { kind } = options;
  if (kind === "list" || kind === "tags" || kind === "aliases") {
    return editableList(
      value,
      key,
      options.listPreviewCount,
      options.listExpanded,
    );
  }
  if (kind === "checkbox") {
    return `<input type="checkbox" data-property="${escape(key)}" class="metadata-input-checkbox" tabindex="-1"${value === true ? " checked" : ""}${attr("aria-label", key)}>`;
  }
  const text = propertyInputText(value);
  if (kind === "text") {
    const input = `<div class="metadata-input-longtext" contenteditable="true" role="textbox" tabindex="-1" data-placeholder="Empty"${attr("aria-label", key)}${attr("data-property-input", key)} data-property-kind="text">${escape(text)}</div>`;
    if (/^\[\[[^\n]+\]\]$/.test(text)) {
      return `<span class="metadata-link" data-property-display>${renderInline(text)}<button type="button" tabindex="-1" class="metadata-property-link-flair" data-property-edit${attr("aria-label", `Edit ${key}`)}>${propertyFlairIcon("pencil")}</button></span>${input.replace("<div ", "<div hidden ")}`;
    }
    return input;
  }
  const inputType = {
    number: "number",
    date: "date",
    datetime: "datetime-local",
  }[kind];
  return `<input${attr("type", inputType)}${attr("data-property-input", key)}${attr("data-property-kind", kind)}${attr("aria-label", key)}${attr("value", matchesPropertyKind(kind, value) ? text : "")} class="metadata-input-${kind}" tabindex="-1"${kind === "number" ? ' inputmode="decimal" step="any"' : ""}>`;
}

function editableList(
  value: unknown,
  key: string,
  previewCount: number,
  expanded: boolean,
): string {
  const values = value === null || value === undefined ? [] : asList(value);
  const chips = values
    .map((item, index) => {
      const raw = propertyInputText(item);
      const text = key.toLowerCase() === "tags" ? raw.replace(/^#/, "") : raw;
      const label = pillLabel(text, key.toLowerCase() === "tags");
      const extra =
        !expanded && index >= previewCount
          ? " hidden data-property-chip-extra"
          : "";
      return `<span class="property-chip multi-select-pill"${extra} tabindex="-1" data-property-chip="${index}"><span class="multi-select-pill-content">${label}</span><button type="button" tabindex="-1" class="multi-select-pill-remove-button" data-property-remove="${index}"${attr("aria-label", `Remove ${text} from ${key}`)}>×</button></span>`;
    })
    .join("");
  const more =
    !expanded && values.length > previewCount
      ? `<button type="button" data-property-list-more>Showing ${previewCount} of ${values.length}</button>`
      : "";
  return `<div class="property-list multi-select-container"${attr("data-property-list", key)}>${chips}${more}<div class="multi-select-input" contenteditable="true" role="textbox" tabindex="-1" data-property-list-input${attr("aria-label", `Add item to ${key}`)}${values.length ? "" : ' data-placeholder="Empty"'}></div></div>`;
}

function pillLabel(text: string, isTags: boolean): string {
  if (isTags && validTag(text)) {
    return `<button type="button" tabindex="-1" class="md-tag"${attr("data-tag", text)}${attr("aria-label", `Search tag #${text}`)}>${escape(text)}</button>`;
  }
  if (/^\[\[[^\n]+\]\]$/.test(text)) {
    return `<span class="metadata-link">${renderInline(text)}</span>`;
  }
  return `<span>${escape(text)}</span>`;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function propertyInputText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return Array.isArray(value)
      ? value.map(propertyInputText).join(",")
      : (JSON.stringify(value) ?? "");
  }
  return String(value);
}

/** Nested maps / non-scalar collections Obsidian renders as type Unknown. */
function isUnknownPropertyValue(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

/**
 * OKF SPEC §5.2 `generated` / `verified` — typed actor+time UI.
 * `decision_confirmation` is WorkVault-only and stays Unknown+JSON.
 */
function isOkfProvenance(key: string, value: unknown): boolean {
  const name = key.toLowerCase();
  if (name !== "generated" && name !== "verified") {
    return false;
  }
  if (Array.isArray(value)) {
    return (
      value.length > 0 &&
      value.every(
        (entry) =>
          entry !== null &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          typeof (entry as Record<string, unknown>).by === "string",
      )
    );
  }
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).by === "string"
  );
}

function okfProvenanceValue(value: unknown): string {
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.by === "string" && record.by) {
    parts.push(
      `<span class="okf-provenance-by"${attr("title", "by")}>${escape(record.by)}</span>`,
    );
  }
  if (record.at !== null && record.at !== undefined && record.at !== "") {
    parts.push(
      `<span class="okf-provenance-at"${attr("title", "at")}>${escape(String(record.at))}</span>`,
    );
  }
  const known = new Set(["by", "at"]);
  const extra = Object.fromEntries(
    Object.entries(record).filter(([k]) => !known.has(k)),
  );
  if (Object.keys(extra).length > 0) {
    parts.push(
      `<span class="okf-provenance-extra"${attr("title", "other")}>${escape(JSON.stringify(extra))}</span>`,
    );
  }
  return `<div class="metadata-property-value-item mod-okf-provenance" tabindex="0">${parts.join("")}</div>`;
}

function okfVerifiedListValue(value: unknown[]): string {
  const rows = value.map((entry) => okfProvenanceValue(entry)).join("");
  return `<div class="metadata-property-value-item mod-okf-verified-list" tabindex="0">${rows}</div>`;
}

/** Obsidian REA: `metadata-property-value-item mod-unknown` + JSON.stringify. */
function unknownPropertyValue(value: unknown): string {
  return `<span class="metadata-property-value-item mod-unknown" tabindex="0">${escape(JSON.stringify(value))}</span>`;
}

function editableYaml(key: string, text: string): string {
  // textarea keeps Enter as real newlines (contenteditable textContent does not).
  return `<textarea class="metadata-input-longtext metadata-input-yaml" rows="3" tabindex="-1" data-placeholder="Empty"${attr("aria-label", key)}${attr("data-property-input", key)} data-property-kind="yaml">${escape(text)}</textarea>`;
}

function complexFallback(draft: string | undefined): string {
  void draft;
  return '<span class="property-empty">Edit in Source mode: tagged, recursive or unsupported YAML.</span>';
}
