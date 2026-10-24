import type {
  BaseCellValue,
  BaseColumn,
  BaseEvaluatedRow,
  BaseEvaluatedView,
} from "../../markdown/bases";

export type OpenBaseTarget = (target: string, wiki: boolean) => void;

export interface RenderEnv {
  doc: Document;
  open: OpenBaseTarget;
}

export const FILE_LINK_COLUMNS: ReadonlySet<string> = new Set([
  "file.name",
  "file.file",
  "file.basename",
  "file.path",
  "file.fullname",
]);

export function buildCardsView(
  env: RenderEnv,
  evaluated: BaseEvaluatedView,
): HTMLElement {
  const container = env.doc.createElement("div");
  container.className = "bases-cards-container";
  for (const group of evaluated.groups) {
    const groupEl = env.doc.createElement("div");
    groupEl.className = "bases-cards-group";
    if (group.key !== undefined) {
      const heading = env.doc.createElement("div");
      heading.className = "bases-group-heading";
      heading.append(renderCellValue(env, group.key));
      groupEl.append(heading);
    }
    for (const row of group.rows) {
      groupEl.append(buildCardItem(env, row, evaluated.columns));
    }
    container.append(groupEl);
  }
  return container;
}

function buildCardItem(
  env: RenderEnv,
  row: BaseEvaluatedRow,
  columns: BaseColumn[],
): HTMLElement {
  const card = env.doc.createElement("div");
  card.className = "bases-cards-item";
  card.dataset.path = row.entry.path;
  const titleWrap = env.doc.createElement("div");
  titleWrap.className = "bases-cards-title";
  titleWrap.append(createNoteLink(env, row.entry.path, row.entry.basename));
  card.append(titleWrap);
  for (const col of columns) {
    if (col.id === "file.name" || col.id === "file.file") {
      continue;
    }
    const cell = row.cells[col.id];
    if (!cell || cell.kind === "null") {
      continue;
    }
    const line = env.doc.createElement("div");
    line.className = "bases-cards-line";
    line.dataset.property = col.id;
    const label = env.doc.createElement("span");
    label.className = "bases-cards-label";
    label.textContent = `${col.displayName}: `;
    line.append(label, renderCellValue(env, cell));
    card.append(line);
  }
  return card;
}

export function buildListView(
  env: RenderEnv,
  evaluated: BaseEvaluatedView,
): HTMLElement {
  const container = env.doc.createElement("div");
  container.className = "bases-list-container";
  for (const group of evaluated.groups) {
    const groupEl = env.doc.createElement("div");
    groupEl.className = "bases-list-group";
    if (group.key !== undefined) {
      const heading = env.doc.createElement("div");
      heading.className = "bases-group-heading";
      heading.append(renderCellValue(env, group.key));
      groupEl.append(heading);
    }
    const ul = env.doc.createElement("ul");
    ul.className = "bases-list-group-list";
    for (const row of group.rows) {
      ul.append(buildListItem(env, row, evaluated.columns));
    }
    groupEl.append(ul);
    container.append(groupEl);
  }
  return container;
}

function buildListItem(
  env: RenderEnv,
  row: BaseEvaluatedRow,
  columns: BaseColumn[],
): HTMLElement {
  const li = env.doc.createElement("li");
  li.className = "bases-list-item";
  li.dataset.path = row.entry.path;
  let appended = 0;
  for (const col of columns) {
    const cell = row.cells[col.id] ?? { kind: "null" };
    if (cell.kind === "null" && !FILE_LINK_COLUMNS.has(col.id)) {
      continue;
    }
    if (appended > 0) {
      const sep = env.doc.createElement("span");
      sep.className = "bases-list-separator";
      sep.textContent = " — ";
      li.append(sep);
    }
    if (FILE_LINK_COLUMNS.has(col.id)) {
      const label = cellToLabel(cell, row.entry.basename);
      li.append(createNoteLink(env, row.entry.path, label));
    } else {
      li.append(renderCellValue(env, cell));
    }
    appended += 1;
  }
  return li;
}

export function renderCellValue(
  env: RenderEnv,
  cell: BaseCellValue,
): HTMLElement {
  const wrapper = env.doc.createElement("span");
  wrapper.className = "bases-rendered-value";
  switch (cell.kind) {
    case "null":
      wrapper.classList.add("is-empty");
      return wrapper;
    case "boolean": {
      const input = env.doc.createElement("input");
      input.type = "checkbox";
      input.className = "task-list-item-checkbox";
      input.checked = cell.value;
      input.disabled = true;
      wrapper.append(input);
      return wrapper;
    }
    case "link":
      wrapper.append(createNoteLink(env, cell.target, cell.label));
      return wrapper;
    case "tag": {
      const pill = env.doc.createElement("span");
      pill.className = "multi-select-pill tag";
      pill.textContent = cell.value;
      wrapper.append(pill);
      return wrapper;
    }
    case "list":
      return renderListCellValue(env, wrapper, cell.items);
    case "duration":
      wrapper.textContent = `${Math.round((cell.ms / 86_400_000) * 100) / 100}d`;
      return wrapper;
    default:
      wrapper.textContent = String(cell.value);
      return wrapper;
  }
}

function renderListCellValue(
  env: RenderEnv,
  wrapper: HTMLElement,
  items: BaseCellValue[],
): HTMLElement {
  wrapper.classList.add("bases-rendered-list");
  for (const item of items) {
    if (item.kind === "link" || item.kind === "tag") {
      wrapper.append(renderCellValue(env, item));
    } else {
      const pill = env.doc.createElement("span");
      pill.className = "multi-select-pill";
      pill.textContent = cellToLabel(item, "");
      wrapper.append(pill);
    }
  }
  return wrapper;
}

export function cellToLabel(cell: BaseCellValue, fallback: string): string {
  if (cell.kind === "string") {
    return cell.value;
  }
  if (cell.kind === "link") {
    return cell.label || cell.target;
  }
  if (cell.kind === "number" || cell.kind === "boolean") {
    return String(cell.value);
  }
  if (cell.kind === "date") {
    return cell.value;
  }
  return fallback;
}

export function createNoteLink(
  env: RenderEnv,
  target: string,
  label: string,
): HTMLElement {
  const a = env.doc.createElement("a");
  a.className = "internal-link";
  a.dataset.wiki = "true";
  a.dataset.href = target;
  a.href = target;
  a.textContent = label;
  wireInteractiveClick(a, () => env.open(target, true));
  return a;
}

export function wireInteractiveClick(
  el: HTMLElement,
  action: () => void,
): void {
  el.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  });
}
