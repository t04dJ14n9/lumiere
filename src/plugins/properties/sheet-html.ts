import {
  frontmatter,
  propertyInput,
  matchesPropertyKind,
} from "../../markdown/properties";
import {
  inferPropertyKind,
  propertyKindLabels,
} from "../../markdown/properties/types";
import type {
  PropertyKind,
  PropertyTypes,
} from "../../markdown/properties/types";
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

function propertyValue(
  value: unknown,
  key?: string,
  ancestors = new Set<object>(),
): string {
  if (typeof value === "boolean") {
    return checkboxValue(value, key);
  }
  if (
    key !== undefined &&
    (typeof value === "string" || typeof value === "number")
  ) {
    return `<span data-property-display>${propertyValue(value)}</span><button type="button" data-property-edit${attr("aria-label", `Edit ${key}`)}>Edit</button><input hidden${attr("type", typeof value === "number" ? "number" : "text")}${attr("data-property-input", key)}${attr("aria-label", key)}${attr("value", String(value))} step="any">`;
  }
  if (typeof value === "object" && value !== null) {
    return propertyObject(value, ancestors);
  }
  if (value === null || value === undefined || value === "") {
    return '<span class="property-empty">Empty</span>';
  }
  const text = scalarText(value);
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
  return `<details class="properties" open><summary tabindex="-1"><span data-properties-heading tabindex="0">Properties</span> <span class="property-count">${Object.keys(properties.values!).length}</span></summary><dl>${Object.entries(
    properties.values!,
  )
    .map(([key, value]) =>
      propertyRow(key, value, { properties, types, forced }),
    )
    .join(
      "",
    )}</dl><button type="button" data-property-add>Add property</button><div data-property-new hidden><input aria-label="New property name" placeholder="Property name"><button type="button" data-property-confirm>Add</button><button type="button" data-property-cancel>Cancel</button></div><p class="property-message" aria-live="polite"></p></details>`;
}

function scalarText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
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
              `<span class="property-chip">${propertyValue(item, undefined, path)}</span>`,
          )
          .join(" ")
      : '<span class="property-empty">Empty list</span>';
  }
  const entries = Object.entries(value);
  return `<details class="property-object"><summary>${entries.length} ${entries.length === 1 ? "field" : "fields"}</summary><dl>${entries.map(([name, item]) => `<div><dt>${escape(name)}</dt><dd>${propertyValue(item, undefined, path)}</dd></div>`).join("")}</dl></details>`;
}

interface PropertyDisplay {
  properties: NonNullable<ReturnType<typeof frontmatter>>;
  types: PropertyTypes;
  forced: PropertyTypes;
}

function propertyRow(
  key: string,
  value: unknown,
  options: PropertyDisplay,
): string {
  const { properties, types, forced } = options;
  const kind = inferPropertyKind(key, value, types);
  const warning =
    !matchesPropertyKind(kind, value) && forced[key] !== kind
      ? `<button type="button" class="property-type-warning" data-property-convert${attr("aria-label", `Update ${key} to ${propertyKindLabels[kind]}`)} title="The stored value has a different type">!</button>`
      : "";
  return `<div class="property-row" tabindex="0"${attr("data-property-row", key)}><dt><button type="button" data-property-type${attr("aria-label", `Type of ${key}: ${propertyKindLabels[kind]}`)}>${propertyIcon(key, value, kind)}</button><input class="property-key"${attr("data-property-name", key)}${attr("aria-label", `Property name: ${key}`)}${attr("value", key)}></dt><dd>${warning}${displayProperty(key, value, { properties, types, forced })}</dd></div>`;
}

function displayProperty(
  key: string,
  value: unknown,
  options: PropertyDisplay,
): string {
  const { properties, types, forced } = options;
  const expected = inferPropertyKind(key, value, types);
  const force = forced[key] === expected;
  const kind =
    force || matchesPropertyKind(expected, value)
      ? expected
      : inferPropertyKind(key, value);
  const editable = isEditableProperty(properties, key);
  if ((kind === "list" || kind === "tags") && editable) {
    return editableList(value, key);
  }
  if (key.toLowerCase() === "tags" && Array.isArray(value) && value.length) {
    return tagValues(value);
  }
  if (editable && kind === "checkbox") {
    return editableCheckbox(value, key, force);
  }
  if (editable && !["list", "tags", "checkbox"].includes(kind)) {
    return editableScalar(value, key, kind, force);
  }
  return propertyValue(value);
}

function editableList(value: unknown, key: string): string {
  const values = asList(value);
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

function tagValues(value: unknown[]): string {
  return value
    .map((item) => {
      const tag = typeof item === "string" ? item.replace(/^#/, "") : undefined;
      return validTag(tag) ? tagButton(tag) : propertyValue(item);
    })
    .join(" ");
}

function editableScalar(
  value: unknown,
  key: string,
  kind: PropertyKind,
  force: boolean,
): string {
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

function asList(value: unknown): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function checkboxValue(value: boolean, key?: string): string {
  return `<input type="checkbox"${key === undefined ? " disabled" : attr("data-property", key)}${value ? " checked" : ""}${attr("aria-label", key ?? "Property value")}>`;
}

function editableCheckbox(value: unknown, key: string, force: boolean): string {
  return (
    propertyValue(force ? Boolean(value) : value === true, key) +
    (typeof value !== "boolean" && value !== null
      ? `<span class="property-type-warning">${propertyValue(value)}</span>`
      : "")
  );
}

function isEditableProperty(
  properties: PropertyDisplay["properties"],
  key: string,
): boolean {
  return !!(
    properties.editableKeys?.includes(key) ||
    properties.editableLists?.includes(key)
  );
}
