import { frontmatter, propertyInput, matchesPropertyKind } from "../../markdown/properties";
import { inferPropertyKind, propertyKindLabels } from "../../markdown/properties/types";
import type { PropertyTypes } from "../../markdown/properties/types";
import { propertyIcon } from "../../webview/ui/icons";
import { validTag } from "../../markdown/tags/grammar";
import { attr, escape } from "../../markdown/html/helpers";
import { createRenderer } from "../../markdown/html";
const { renderInline } = createRenderer();
const tagButton = (tag: string) =>
  `<button type="button" class="md-tag"${attr("data-tag", tag)}${attr("aria-label", `Search tag #${tag}`)}>#${escape(tag)}</button>`;
function propertyInputText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => propertyInputText(item)).join(",");
  }
  return JSON.stringify(value) ?? "";
}

function propertyValue(value: unknown, key?: string, ancestors = new Set<object>()): string {
  if (typeof value === "boolean") {
    return `<input type="checkbox"${key === undefined ? " disabled" : attr("data-property", key)}${value ? " checked" : ""}${attr("aria-label", key ?? "Property value")}>`;
  }
  if (key !== undefined && (typeof value === "string" || typeof value === "number")) {
    return `<span data-property-display>${propertyValue(value)}</span><button type="button" data-property-edit${attr("aria-label", `Edit ${key}`)}>Edit</button><input hidden${attr("type", typeof value === "number" ? "number" : "text")}${attr("data-property-input", key)}${attr("aria-label", key)}${attr("value", String(value))} step="any">`;
  }
  if (typeof value === "object" && value !== null) {
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
                `<span class="property-chip">${propertyValue(item, undefined, path)}</span>`,
            )
            .join(" ")
        : '<span class="property-empty">Empty list</span>';
    }
    const entries = Object.entries(value);
    return `<details class="property-object"><summary>${entries.length} ${entries.length === 1 ? "field" : "fields"}</summary><dl>${entries.map(([name, item]) => `<div><dt>${escape(name)}</dt><dd>${propertyValue(item, undefined, path)}</dd></div>`).join("")}</dl></details>`;
  }
  if (value === null || value === undefined || value === "") {
    return '<span class="property-empty">Empty</span>';
  }
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
  return /^\[\[[^\n]+\]\]$/.test(text) || /^https?:\/\/[^\s<>]+$/.test(text)
    ? renderInline(text)
    : `<span class="property-text">${escape(text)}</span>`;
}
export function renderProperties(
  source: string,
  types: PropertyTypes = {},
  forced: PropertyTypes = {},
): string {
  const properties = frontmatter(source);
  if (!properties) {
    return "";
  }
  if (properties.error) {
    return `<div class="render-error">${escape(properties.error)}</div><pre>${escape(properties.raw)}</pre>`;
  }
  const display = (key: string, value: unknown): string => {
    const expected = inferPropertyKind(key, value, types);
    const force = forced[key] === expected;
    const kind =
      force || matchesPropertyKind(expected, value) ? expected : inferPropertyKind(key, value);
    const editable =
      properties.editableKeys?.includes(key) || properties.editableLists?.includes(key);
    if ((kind === "list" || kind === "tags") && editable) {
      const values: unknown[] =
        value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
      const chips = values
        .map((item, index) => {
          const raw = propertyInputText(item);
          const text = key.toLowerCase() === "tags" ? raw.replace(/^#/, "") : raw;
          const label =
            key.toLowerCase() === "tags" && validTag(text)
              ? `<button type="button" class="md-tag"${attr("data-tag", text)}${attr("aria-label", `Search tag #${text}`)}>${escape(text)}</button>`
              : `<span>${escape(text)}</span>`;
          return `<span class="property-chip" tabindex="0" data-property-chip="${index}">${label}<button type="button" data-property-remove="${index}"${attr("aria-label", `Remove ${text} from ${key}`)}>×</button></span>`;
        })
        .join("");
      return `<span class="property-list"${attr("data-property-list", key)}>${chips}<input type="text"${attr("aria-label", `Add item to ${key}`)}></span>`;
    }
    if (key.toLowerCase() === "tags" && Array.isArray(value) && value.length) {
      return value
        .map((item) => {
          const tag = typeof item === "string" ? item.replace(/^#/, "") : undefined;
          return validTag(tag) ? tagButton(tag) : propertyValue(item);
        })
        .join(" ");
    }
    if (editable && kind === "checkbox") {
      return (
        propertyValue(force ? Boolean(value) : value === true, key) +
        (typeof value !== "boolean" && value !== null
          ? `<span class="property-type-warning">${propertyValue(value)}</span>`
          : "")
      );
    }
    if (editable && !["list", "tags", "checkbox"].includes(kind)) {
      const text = propertyInputText(value);
      const valid = propertyInput(kind, text) !== undefined;
      const inputType =
        valid || force
          ? ((
              {
                number: "number",
                date: "date",
                datetime: "datetime-local",
              } as Record<string, string>
            )[kind] ?? "text")
          : "text";
      return `<span data-property-display>${propertyValue(value)}</span><button type="button" data-property-edit${attr("aria-label", `Edit ${key}`)}>Edit</button><input hidden${attr("type", inputType)}${attr("data-property-input", key)}${attr("data-property-kind", kind)}${attr("aria-label", key)}${attr("value", text)} step="any">`;
    }
    return propertyValue(value);
  };
  return `<details class="properties" open><summary tabindex="-1"><span data-properties-heading tabindex="0">Properties</span> <span class="property-count">${Object.keys(properties.values!).length}</span></summary><dl>${Object.entries(
    properties.values!,
  )
    .map(([key, value]) => {
      const kind = inferPropertyKind(key, value, types);
      const warning =
        !matchesPropertyKind(kind, value) && forced[key] !== kind
          ? `<button type="button" class="property-type-warning" data-property-convert${attr("aria-label", `Update ${key} to ${propertyKindLabels[kind]}`)} title="The stored value has a different type">!</button>`
          : "";
      return `<div class="property-row" tabindex="0"${attr("data-property-row", key)}><dt><button type="button" data-property-type${attr("aria-label", `Type of ${key}: ${propertyKindLabels[kind]}`)}>${propertyIcon(key, value, kind)}</button><input class="property-key"${attr("data-property-name", key)}${attr("aria-label", `Property name: ${key}`)}${attr("value", key)}></dt><dd>${warning}${display(key, value)}</dd></div>`;
    })
    .join(
      "",
    )}</dl><button type="button" data-property-add>Add property</button><div data-property-new hidden><input aria-label="New property name" placeholder="Property name"><button type="button" data-property-confirm>Add</button><button type="button" data-property-cancel>Cancel</button></div><p class="property-message" aria-live="polite"></p></details>`;
}
