import type { GraphSnapshot } from "../../plugins/graph/snapshot";
import type { GraphViewState } from "./persist";

export interface GraphChrome {
  show(snapshot: GraphSnapshot, needsRelayout: boolean): void;
  view(): GraphViewState;
  onChange(listener: () => void): void;
  onRelayout(listener: () => void): void;
}

/** Toolbar for scope, filters and layout. It never fetches a note or a resource. */
export function mountChrome(
  root: HTMLElement,
  initial: GraphViewState,
): GraphChrome {
  const scope = document.createElement("p");
  scope.className = "graph-scope";
  const banners = document.createElement("div");
  banners.className = "graph-banners";
  const controls = document.createElement("div");
  controls.className = "graph-controls";
  const legend = document.createElement("div");
  legend.className = "graph-legend";
  const facets = document.createElement("div");
  facets.className = "graph-facets";
  root.append(scope, banners, controls, facets, legend);
  const fields = buildControls(controls, initial);
  let current = initial;
  let listener = () => {};
  let relayout = () => {};
  fields.relayout.addEventListener("click", () => relayout());
  fields.clear.addEventListener("click", () => {
    fields.search.value = "";
    fields.orphans.checked = false;
    fields.conformant.checked = false;
    clearChecks(facets);
    listener();
  });
  for (const input of [
    fields.mode,
    fields.depth,
    fields.color,
    fields.orphans,
    fields.conformant,
  ]) {
    input.addEventListener("change", () => listener());
  }
  fields.search.addEventListener("input", () => listener());
  facets.addEventListener("change", () => listener());
  return {
    show(snapshot, needsRelayout) {
      scope.textContent = scopeLabel(snapshot);
      fields.mode.value = snapshot.mode;
      fields.depth.value = String(snapshot.depth);
      fields.color.value = snapshot.colorBy;
      banners.replaceChildren(...bannerNodes(snapshot, needsRelayout));
      legend.replaceChildren(...legendNodes(snapshot));
      syncFacets(facets, snapshot, selectionFrom(current.filters));
    },
    view: () => {
      current = viewFrom(fields, facets);
      return current;
    },
    onChange(next) {
      listener = next;
    },
    onRelayout(next) {
      relayout = next;
    },
  };
}

interface Fields {
  mode: HTMLSelectElement;
  depth: HTMLInputElement;
  color: HTMLSelectElement;
  search: HTMLInputElement;
  orphans: HTMLInputElement;
  conformant: HTMLInputElement;
  clear: HTMLButtonElement;
  relayout: HTMLButtonElement;
}

function buildControls(root: HTMLElement, initial: GraphViewState): Fields {
  const mode = select(
    [
      ["global", "Global"],
      ["local", "Local"],
    ],
    initial.mode,
  );
  const depth = document.createElement("input");
  depth.type = "number";
  depth.min = "1";
  depth.max = "3";
  depth.value = String(initial.depth);
  const color = select(
    [
      ["type", "Type"],
      ["folder", "Folder"],
      ["tag", "Tag"],
    ],
    initial.colorBy,
  );
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search title, path or description";
  search.value = initial.filters.text;
  const orphans = checkbox("Orphans", initial.filters.orphans);
  const conformant = checkbox(
    "Conformant only",
    initial.filters.conformantOnly,
  );
  const clear = button("Clear filters");
  const relayout = button("Re-layout");
  root.append(
    label("Mode", mode),
    label("Depth", depth),
    label("Color", color),
    search,
    orphans.label,
    conformant.label,
    clear,
    relayout,
  );
  return {
    mode,
    depth,
    color,
    search,
    orphans: orphans.input,
    conformant: conformant.input,
    clear,
    relayout,
  };
}

function viewFrom(fields: Fields, facets: HTMLElement): GraphViewState {
  const mode = fields.mode.value === "local" ? "local" : "global";
  const colorBy = colorValue(fields.color.value);
  return {
    mode,
    depth: numberValue(fields.depth.value),
    colorBy,
    filters: {
      types: groupValues(facets, "type"),
      tags: groupValues(facets, "tag"),
      folders: groupValues(facets, "folder"),
      text: fields.search.value,
      orphans: fields.orphans.checked,
      conformantOnly: fields.conformant.checked,
    },
  };
}

function scopeLabel(snapshot: GraphSnapshot): string {
  if (!snapshot.bundleName) {
    return "No OKF bundle";
  }
  if (!snapshot.bundlePath) {
    return snapshot.bundleName;
  }
  return `${snapshot.bundleName} — ${snapshot.bundlePath}`;
}

function bannerNodes(
  snapshot: GraphSnapshot,
  needsRelayout: boolean,
): HTMLElement[] {
  return bannerText(snapshot, needsRelayout).map((text) => {
    const line = document.createElement("p");
    line.textContent = text;
    return line;
  });
}

function bannerText(snapshot: GraphSnapshot, needsRelayout: boolean): string[] {
  const lines: string[] = [];
  if (snapshot.reason) {
    lines.push(snapshot.reason);
  }
  if (snapshot.focusExcluded) {
    lines.push("Focus excluded by filters");
  }
  if (snapshot.completeness === "indexing") {
    lines.push("Indexing notes…");
  }
  if (snapshot.completeness === "partial") {
    lines.push("The vault index is partial, so some notes may be missing.");
  }
  if (snapshot.omittedConformant > 0) {
    lines.push(
      `Hiding ${snapshot.omittedConformant} notes that are not conformant.`,
    );
  }
  if (needsRelayout) {
    lines.push(
      "The graph changed enough to keep this layout. Re-layout draws it again.",
    );
  }
  return lines;
}

function legendNodes(snapshot: GraphSnapshot): HTMLElement[] {
  return snapshot.legend.map((entry) => {
    const item = document.createElement("span");
    item.className = "graph-legend-item";
    const swatch = document.createElement("i");
    swatch.style.background = entry.color;
    item.append(
      swatch,
      document.createTextNode(`${entry.key} (${entry.count})`),
    );
    return item;
  });
}

function syncFacets(
  root: HTMLElement,
  snapshot: GraphSnapshot,
  selected: Map<string, Set<string>>,
): void {
  root.replaceChildren(
    facetGroup("type", "Types", snapshot.facets.types, selected.get("type")),
    facetGroup("tag", "Tags", snapshot.facets.tags, selected.get("tag")),
    facetGroup(
      "folder",
      "Folders",
      snapshot.facets.folders,
      selected.get("folder"),
    ),
  );
}

function facetGroup(
  name: string,
  title: string,
  values: readonly string[],
  selected: Set<string> | undefined,
): HTMLElement {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = title;
  group.append(legend);
  group.dataset.facet = name;
  for (const value of values) {
    const box = checkbox(value, selected?.has(value) ?? false);
    box.input.value = value;
    group.append(box.label);
  }
  return group;
}

function selectionFrom(
  filters: GraphViewState["filters"],
): Map<string, Set<string>> {
  return new Map([
    ["type", new Set(filters.types)],
    ["tag", new Set(filters.tags)],
    ["folder", new Set(filters.folders)],
  ]);
}

function groupValues(root: HTMLElement, name: string): string[] {
  const group = root.querySelector(`[data-facet="${name}"]`);
  if (!group) {
    return [];
  }
  const values: string[] = [];
  for (const box of group.querySelectorAll("input")) {
    if (box.checked && box.value) {
      values.push(box.value);
    }
  }
  return values;
}

function clearChecks(root: HTMLElement): void {
  for (const box of root.querySelectorAll("input")) {
    box.checked = false;
  }
}

function select(
  options: readonly (readonly [string, string])[],
  value: string,
) {
  const element = document.createElement("select");
  for (const [option, text] of options) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = text;
    item.selected = option === value;
    element.append(item);
  }
  return element;
}

function checkbox(text: string, checked: boolean) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  label.append(input, document.createTextNode(text));
  return { label, input };
}

function button(text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  return element;
}

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const element = document.createElement("label");
  element.append(document.createTextNode(text), control);
  return element;
}

function colorValue(value: string): GraphViewState["colorBy"] {
  if (value === "folder" || value === "tag") {
    return value;
  }
  return "type";
}

function numberValue(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 2;
  }
  return Math.min(3, Math.max(1, Math.floor(parsed)));
}
