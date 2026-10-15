import {
  frontmatter,
  matchesPropertyKind,
  propertyYamlInput,
} from "../../markdown/properties";
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
import { stringify } from "yaml";
const { renderInline } = createRenderer();

export function renderProperties(
  source: string,
  types: PropertyTypes = {},
  options: {
    collapsed?: boolean;
    allowEmpty?: boolean;
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
  const values = properties?.values ?? {};
  const rows = Object.entries(values)
    .map(([key, value]) =>
      propertyRow(key, value, {
        kind: inferPropertyKind(key, value, types),
        editable: !!(
          properties?.editableKeys?.includes(key) ||
          properties?.editableLists?.includes(key)
        ),
        custom: options.renderValue?.(key, value, values),
      }),
    )
    .join("");
  return `<div class="properties metadata-container${options.collapsed ? " is-collapsed" : ""}"><div class="metadata-properties-heading" data-properties-heading tabindex="0" role="button" aria-expanded="${!options.collapsed}"><span class="metadata-collapse-indicator">${propertyFlairIcon("collapse")}</span><span>Properties</span></div><div class="metadata-content"${options.collapsed ? " hidden" : ""}><div class="metadata-properties">${rows}</div><button type="button" data-property-add><span aria-hidden="true">＋</span> Add property</button></div><p class="property-message" aria-live="polite"></p></div>`;
}

function propertyBody(
  key: string,
  value: unknown,
  options: {
    kind: PropertyKind;
    editable: boolean;
    custom: string | undefined;
  },
): string {
  // Custom renderers (e.g. Sources) keep structured YAML editing even for [].
  if (options.custom) {
    return complexEditable(key, value, options.custom);
  }
  if (options.editable) {
    return editableValue(key, value, options.kind);
  }
  return complexEditable(key, value, undefined);
}

function propertyRow(
  key: string,
  value: unknown,
  options: {
    kind: PropertyKind;
    editable: boolean;
    custom: string | undefined;
  },
): string {
  const { kind } = options;
  const warning = mismatchWarning(kind, !matchesPropertyKind(kind, value));
  const body = propertyBody(key, value, options);
  return `<div class="property-row metadata-property" tabindex="0"${attr("data-property-row", key)}${attr("data-property-key", key)}><div class="metadata-property-key"><button type="button" tabindex="-1" data-property-type${attr("aria-label", `Type of ${key}: ${propertyKindLabels[kind]}`)}><span class="metadata-property-icon">${propertyIcon(key, value, kind)}</span></button><input class="property-key metadata-property-key-input" tabindex="-1"${attr("data-property-name", key)}${attr("aria-label", `Property name: ${key}`)}${attr("value", key)}></div><div class="metadata-property-value"${attr("data-property-type", kind === "list" ? "multitext" : kind)}>${body}</div>${warning}</div>`;
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
  kind: PropertyKind,
): string {
  if (kind === "list" || kind === "tags" || kind === "aliases") {
    return editableList(value, key);
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

function editableList(value: unknown, key: string): string {
  const values = value === null || value === undefined ? [] : asList(value);
  const chips = values
    .map((item, index) => {
      const raw = propertyInputText(item);
      const text = key.toLowerCase() === "tags" ? raw.replace(/^#/, "") : raw;
      const label = pillLabel(text, key.toLowerCase() === "tags");
      return `<span class="property-chip multi-select-pill" tabindex="-1" data-property-chip="${index}"><span class="multi-select-pill-content">${label}</span><button type="button" tabindex="-1" class="multi-select-pill-remove-button" data-property-remove="${index}"${attr("aria-label", `Remove ${text} from ${key}`)}>×</button></span>`;
    })
    .join("");
  return `<div class="property-list multi-select-container"${attr("data-property-list", key)}>${chips}<div class="multi-select-input" contenteditable="true" role="textbox" tabindex="-1" data-property-list-input${attr("aria-label", `Add item to ${key}`)}${values.length ? "" : ' data-placeholder="Empty"'}></div></div>`;
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

function complexEditable(
  key: string,
  value: unknown,
  custom: string | undefined,
): string {
  if (hasCycle(value)) {
    return custom ?? propertyValue(value);
  }
  const text = yamlDraft(value);
  if (text === undefined) {
    return custom ?? propertyValue(value);
  }
  const editor = editableYaml(key, text);
  return custom
    ? `<div class="property-complex">${custom}${editor}</div>`
    : editor;
}

function hasCycle(value: unknown, ancestors = new Set<object>()): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (ancestors.has(value)) {
    return true;
  }
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const cyclic = children.some((item) => hasCycle(item, ancestors));
  ancestors.delete(value);
  return cyclic;
}

function editableYaml(key: string, text: string): string {
  // textarea keeps Enter as real newlines (contenteditable textContent does not).
  return `<textarea class="metadata-input-longtext metadata-input-yaml" rows="3" tabindex="-1" data-placeholder="Empty"${attr("aria-label", key)}${attr("data-property-input", key)} data-property-kind="yaml">${escape(text)}</textarea>`;
}

/** Undefined when the value cannot round-trip (e.g. recursive aliases). */
function yamlDraft(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Set || value instanceof Map) {
    // Tagged collections (!!set / !!map) do not round-trip through plain YAML.
    return undefined;
  }
  try {
    // Keep stringify's trailing newline: block scalars with |+ need it to
    // round-trip. Prefer double-quoted strings so leading spaces survive.
    const text = stringify(value, {
      lineWidth: 0,
      defaultKeyType: "PLAIN",
      defaultStringType: "QUOTE_DOUBLE",
      aliasDuplicateObjects: false,
    });
    const parsed = propertyYamlInput(text);
    try {
      if (JSON.stringify(parsed) !== JSON.stringify(value)) {
        return undefined;
      }
    } catch {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

function propertyValue(value: unknown, ancestors = new Set<object>()): string {
  if (typeof value === "object" && value !== null) {
    return propertyObject(value, ancestors);
  }
  if (value === null || value === undefined || value === "") {
    return '<span class="property-empty">Empty</span>';
  }
  const text = String(value);
  return /^\[\[[^\n]+\]\]$/.test(text) || /^https?:\/\/[^\s<>]+$/.test(text)
    ? renderInline(text)
    : `<span class="property-text">${escape(text)}</span>`;
}

function propertyObject(value: object, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    return '<span class="property-empty">Recursive YAML alias</span>';
  }
  if (ancestors.size >= 64) {
    return '<span class="property-empty">Further nesting is available in source</span>';
  }
  const path = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.length
      ? value
          .map(
            (item) =>
              `<span class="property-chip">${propertyValue(item, path)}</span>`,
          )
          .join(" ")
      : '<span class="property-empty">Empty list</span>';
  }
  const entries = Object.entries(value);
  return `<details class="property-object"><summary>${entries.length} ${entries.length === 1 ? "field" : "fields"}</summary><dl>${entries.map(([name, item]) => `<div><dt>${escape(name)}</dt><dd>${propertyValue(item, path)}</dd></div>`).join("")}</dl></details>`;
}
