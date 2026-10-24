import {
  evaluateBaseView,
  parseBaseYaml,
  selectBaseView,
  type BaseColumn,
  type BaseDefinition,
  type BaseEvaluatedGroup,
  type BaseEvaluatedRow,
  type BaseEvaluatedView,
  type BaseSortRule,
  type BaseViewConfig,
} from "../../markdown/bases";
import type { Resource } from "../resources/api";
import {
  FILE_LINK_COLUMNS,
  buildCardsView,
  buildListView,
  cellToLabel,
  createNoteLink,
  renderCellValue,
  wireInteractiveClick,
  type OpenBaseTarget,
  type RenderEnv,
} from "./base-embed-views";

export type { OpenBaseTarget };

export interface BaseEmbedContext {
  target: string;
  wiki: boolean;
  resource: Resource;
  open: OpenBaseTarget;
}

function splitTargetSubpath(target: string): {
  fileTarget: string;
  subpath?: string;
} {
  const hash = target.indexOf("#");
  if (hash < 0) {
    return { fileTarget: target.trim() };
  }
  const fileTarget = target.slice(0, hash).trim() || target.trim();
  const subpath = target.slice(hash + 1).trim();
  return subpath ? { fileTarget, subpath } : { fileTarget };
}

export function renderBaseEmbed(
  embed: HTMLElement,
  ctx: BaseEmbedContext,
): void {
  embed.replaceChildren();
  embed.classList.add("bases-embed", "internal-embed", "is-loaded");
  let definition: BaseDefinition;
  try {
    definition = parseBaseYaml(ctx.resource.text ?? "");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse .base file";
    renderBaseError(embed, `Invalid base syntax: ${message}`, ctx);
    return;
  }
  const { subpath } = splitTargetSubpath(ctx.target);
  const initialView = selectBaseView(definition, subpath);
  if (!initialView) {
    renderBaseError(embed, `Unknown view "${subpath ?? ""}"`, ctx);
    return;
  }
  mountInteractiveBase(embed, definition, initialView, ctx);
}

function renderBaseError(
  embed: HTMLElement,
  message: string,
  ctx: BaseEmbedContext,
): void {
  const doc = embed.ownerDocument;
  const errEl = doc.createElement("div");
  errEl.className = "bases-error markdown-embed-error";
  errEl.textContent = message;
  embed.append(errEl, createOpenBaseButton(doc, ctx));
}

function mountInteractiveBase(
  embed: HTMLElement,
  definition: BaseDefinition,
  initialView: BaseViewConfig,
  ctx: BaseEmbedContext,
): void {
  const doc = embed.ownerDocument;
  const env: RenderEnv = { doc, open: ctx.open };
  let activeView: BaseViewConfig = {
    ...initialView,
    sort: [...initialView.sort],
  };

  const rerender = () => {
    embed.replaceChildren();
    const evaluated = evaluateBaseView(
      definition,
      activeView,
      ctx.resource.entries ?? [],
      ctx.resource.thisEntry ? { thisEntry: ctx.resource.thisEntry } : {},
    );
    const header = buildBaseHeader(doc, definition, evaluated, (nextView) => {
      activeView = { ...nextView, sort: [...nextView.sort] };
      rerender();
    });
    const viewEl = buildBaseViewBody(env, evaluated, (propId) => {
      activeView = {
        ...activeView,
        sort: toggleSortRule(activeView.sort, propId),
      };
      rerender();
    });
    embed.append(header, viewEl, createOpenBaseButton(doc, ctx));
  };

  rerender();
}

function toggleSortRule(
  current: BaseSortRule[],
  property: string,
): BaseSortRule[] {
  const existing = current[0];
  if (!existing || existing.property !== property) {
    return [{ property, direction: "ASC" }];
  }
  if (existing.direction === "ASC") {
    return [{ property, direction: "DESC" }];
  }
  return [];
}

function buildBaseHeader(
  doc: Document,
  definition: BaseDefinition,
  evaluated: BaseEvaluatedView,
  onSelectView: (view: BaseViewConfig) => void,
): HTMLElement {
  const activeView = evaluated.view;
  const header = doc.createElement("div");
  header.className = "bases-header";
  const toolbar = doc.createElement("div");
  toolbar.className = "bases-toolbar";

  const viewsMenu = doc.createElement("div");
  viewsMenu.className = "bases-toolbar-item bases-toolbar-views-menu";
  if (definition.views.length > 1) {
    for (const view of definition.views) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className =
        view.name === activeView.name
          ? "bases-view-tab is-active"
          : "bases-view-tab";
      btn.dataset.viewName = view.name;
      btn.textContent = view.name;
      wireInteractiveClick(btn, () => onSelectView(view));
      viewsMenu.append(btn);
    }
  } else {
    const label = doc.createElement("span");
    label.className = "bases-toolbar-view-name";
    label.textContent = activeView.name;
    viewsMenu.append(label);
  }

  const resultsMenu = doc.createElement("div");
  resultsMenu.className = "bases-toolbar-item bases-toolbar-results-menu";
  const count = evaluated.rows.length;
  resultsMenu.textContent =
    count === evaluated.totalMatches
      ? `${count} ${count === 1 ? "result" : "results"}`
      : `${count} of ${evaluated.totalMatches} results`;

  toolbar.append(viewsMenu, resultsMenu);
  header.append(toolbar);
  return header;
}

function buildBaseViewBody(
  env: RenderEnv,
  evaluated: BaseEvaluatedView,
  onSortColumn: (propId: string) => void,
): HTMLElement {
  const viewEl = env.doc.createElement("div");
  viewEl.className = "bases-view";
  viewEl.dataset.viewType = evaluated.view.type;
  viewEl.dataset.viewName = evaluated.view.name;

  if (evaluated.rows.length === 0) {
    const empty = env.doc.createElement("div");
    empty.className = "bases-empty";
    empty.textContent = "No results";
    viewEl.append(empty);
    return viewEl;
  }
  if (evaluated.view.type === "cards") {
    viewEl.append(buildCardsView(env, evaluated));
    return viewEl;
  }
  if (evaluated.view.type === "list") {
    viewEl.append(buildListView(env, evaluated));
    return viewEl;
  }
  viewEl.append(buildTableView(env, evaluated, onSortColumn));
  return viewEl;
}

function buildTableView(
  env: RenderEnv,
  evaluated: BaseEvaluatedView,
  onSortColumn: (propId: string) => void,
): HTMLElement {
  const container = env.doc.createElement("div");
  container.className = "bases-table-container";
  const table = env.doc.createElement("table");
  table.className = "bases-table";
  table.append(
    buildTableHead(
      env.doc,
      evaluated.columns,
      evaluated.view.sort,
      onSortColumn,
    ),
    buildTableBody(env, evaluated.groups, evaluated.columns),
  );
  if (Object.keys(evaluated.summaries).length > 0) {
    table.append(buildTableFoot(env.doc, evaluated));
  }
  container.append(table);
  return container;
}

function buildTableHead(
  doc: Document,
  columns: BaseColumn[],
  sortRules: BaseSortRule[],
  onSortColumn: (propId: string) => void,
): HTMLElement {
  const thead = doc.createElement("thead");
  thead.className = "bases-thead";
  const tr = doc.createElement("tr");
  tr.className = "bases-tr bases-thead-row";
  for (const col of columns) {
    const th = doc.createElement("th");
    th.className = "bases-th bases-table-header";
    th.dataset.property = col.id;
    const rule = sortRules.find((r) => r.property === col.id);
    if (rule) {
      th.dataset.sort = rule.direction;
    }
    const label = doc.createElement("span");
    label.className = "bases-table-header-label";
    label.textContent = col.displayName;
    th.append(label);
    if (rule) {
      const dir = doc.createElement("span");
      dir.className = "bases-table-sort-indicator";
      dir.textContent = rule.direction === "DESC" ? " ↓" : " ↑";
      th.append(dir);
    }
    wireInteractiveClick(th, () => onSortColumn(col.id));
    tr.append(th);
  }
  thead.append(tr);
  return thead;
}

function buildTableBody(
  env: RenderEnv,
  groups: BaseEvaluatedGroup[],
  columns: BaseColumn[],
): HTMLElement {
  const tbody = env.doc.createElement("tbody");
  tbody.className = "bases-tbody";
  for (const group of groups) {
    if (group.key !== undefined) {
      tbody.append(buildGroupRow(env, group, columns.length));
    }
    for (const row of group.rows) {
      tbody.append(buildTableRow(env, row, columns));
    }
  }
  return tbody;
}

function buildGroupRow(
  env: RenderEnv,
  group: BaseEvaluatedGroup,
  colSpan: number,
): HTMLElement {
  const tr = env.doc.createElement("tr");
  tr.className = "bases-tr bases-group-row";
  const td = env.doc.createElement("td");
  td.className = "bases-td bases-group-cell";
  td.colSpan = Math.max(1, colSpan);
  const heading = env.doc.createElement("div");
  heading.className = "bases-group-heading";
  if (group.key) {
    heading.append(renderCellValue(env, group.key));
  }
  const count = env.doc.createElement("span");
  count.className = "bases-group-count";
  count.textContent = `${group.rows.length}`;
  heading.append(count);
  td.append(heading);
  tr.append(td);
  return tr;
}

function buildTableRow(
  env: RenderEnv,
  row: BaseEvaluatedRow,
  columns: BaseColumn[],
): HTMLElement {
  const tr = env.doc.createElement("tr");
  tr.className = "bases-tr";
  tr.dataset.path = row.entry.path;
  for (const col of columns) {
    const td = env.doc.createElement("td");
    td.className = "bases-td";
    td.dataset.property = col.id;
    const cell = row.cells[col.id] ?? { kind: "null" };
    if (FILE_LINK_COLUMNS.has(col.id)) {
      const label = cellToLabel(cell, row.entry.basename);
      td.append(createNoteLink(env, row.entry.path, label));
    } else {
      td.append(renderCellValue(env, cell));
    }
    tr.append(td);
  }
  return tr;
}

function buildTableFoot(
  doc: Document,
  evaluated: BaseEvaluatedView,
): HTMLElement {
  const tfoot = doc.createElement("tfoot");
  tfoot.className = "bases-tfoot";
  const tr = doc.createElement("tr");
  tr.className = "bases-tr bases-summary-row";
  for (const col of evaluated.columns) {
    const td = doc.createElement("td");
    td.className = "bases-td bases-summary-cell";
    td.dataset.property = col.id;
    const value = evaluated.summaries[col.id];
    const kind = evaluated.view.summaries[col.id];
    if (value !== undefined && kind !== undefined) {
      const labelEl = doc.createElement("span");
      labelEl.className = "bases-summary-label";
      labelEl.textContent = `${kind}: `;
      const valEl = doc.createElement("span");
      valEl.className = "bases-summary-value";
      valEl.textContent = value;
      td.append(labelEl, valEl);
    }
    tr.append(td);
  }
  tfoot.append(tr);
  return tfoot;
}

function createOpenBaseButton(
  doc: Document,
  ctx: BaseEmbedContext,
): HTMLElement {
  const { fileTarget } = splitTargetSubpath(ctx.target);
  const link = doc.createElement("button");
  link.type = "button";
  link.className = "open-embed markdown-embed-link";
  link.setAttribute("aria-label", `Open ${fileTarget}`);
  link.textContent = "↗";
  wireInteractiveClick(link, () => ctx.open(fileTarget, ctx.wiki));
  return link;
}
