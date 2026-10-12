/** The rendered diff panel's DOM: header, aligned rows and change navigation. */
export interface PanelRow {
  readonly kind: "equal" | "modified" | "added" | "deleted";
  readonly before?: string;
  readonly after?: string;
}

export type PanelAction = "openFile" | "openNative";

interface Head {
  readonly labels: readonly HTMLElement[];
  readonly count: HTMLElement;
  readonly tools: HTMLElement;
}

function buildHead(app: HTMLElement): Head {
  const head = app.appendChild(document.createElement("header"));
  head.className = "mw-diff-head";
  const labels = [0, 1].map(() => {
    const cell = head.appendChild(document.createElement("div"));
    cell.className = "mw-diff-label";
    return cell;
  });
  const tools = head.appendChild(document.createElement("div"));
  tools.className = "mw-diff-tools";
  const count = tools.appendChild(document.createElement("span"));
  count.className = "mw-diff-count";
  return { labels, count, tools };
}

function addButton(
  tools: HTMLElement,
  label: string,
  text: string,
  run: () => void,
): void {
  const element = tools.appendChild(document.createElement("button"));
  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.textContent = text;
  element.addEventListener("click", run);
}

function setLabels(head: Head, names: { left: string; right: string }): void {
  const [left, right] = head.labels;
  left!.innerHTML = "";
  left!.append(names.left);
  const badge = left!.appendChild(document.createElement("span"));
  badge.className = "mw-diff-readonly";
  badge.textContent = "read-only";
  right!.textContent = names.right;
}

function renderRows(grid: HTMLElement, rows: readonly PanelRow[]): void {
  const scroll = grid.scrollTop;
  grid.innerHTML = "";
  for (const row of rows) {
    const element = grid.appendChild(document.createElement("div"));
    element.className = `mw-diff-row is-${row.kind}`;
    for (const [side, html] of [
      ["before", row.before],
      ["after", row.after],
    ] as const) {
      const cell = element.appendChild(document.createElement("div"));
      const spacer = html === undefined ? " is-spacer" : "";
      cell.className = `mw-diff-cell is-${side} markdown-rendered${spacer}`;
      if (html !== undefined) {
        cell.innerHTML = html;
      }
    }
  }
  grid.scrollTop = scroll;
}

export function setupPanel(
  app: HTMLElement,
  act: (action: PanelAction) => void,
) {
  const head = buildHead(app);
  const grid = app.appendChild(document.createElement("div"));
  grid.className = "mw-diff-grid";
  let current = -1;
  const changes = () => [
    ...grid.querySelectorAll<HTMLElement>(".mw-diff-row:not(.is-equal)"),
  ];
  const go = (direction: 1 | -1) => {
    const list = changes();
    if (list.length === 0) {
      return;
    }
    current = (current + direction + list.length) % list.length;
    list.forEach((row, index) =>
      row.classList.toggle("is-current", index === current),
    );
    list[current]!.scrollIntoView({ block: "center" });
    head.count.textContent = `${current + 1} of ${list.length} changes`;
  };
  addButton(head.tools, "Previous change", "↑", () => go(-1));
  addButton(head.tools, "Next change", "↓", () => go(1));
  addButton(head.tools, "Open the file", "Open File", () => act("openFile"));
  addButton(head.tools, "Open VS Code's text diff", "Text Diff", () =>
    act("openNative"),
  );
  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "F5") {
      event.preventDefault();
      go(event.shiftKey ? -1 : 1);
    }
  });
  return {
    update(names: { left: string; right: string }, rows: readonly PanelRow[]) {
      setLabels(head, names);
      renderRows(grid, rows);
      const total = changes().length;
      current = Math.min(current, total - 1);
      head.count.textContent = total === 0 ? "No changes" : `${total} changes`;
    },
  };
}
