import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";
import { unifiedRows } from "../../shared/git-diff";
import type { LineRecord } from "../../shared/git-diff";
import type { DocHunk } from "./api";

export interface PeekActions {
  comparisonLabel(): string;
  move(view: EditorView, direction: 1 | -1): void;
  revert(view: EditorView, hunk: DocHunk): void;
  openFull(view: EditorView): void;
  lines(hunk: DocHunk): readonly LineRecord[];
  canStage(hunk: DocHunk): boolean;
  canRevert(hunk: DocHunk): boolean;
  close(view: EditorView): void;
}

interface PeekModel {
  readonly hunk: DocHunk;
  readonly index: number;
  readonly total: number;
  readonly line: number;
}

/** Raw unified peek. Live Preview outside this widget stays rendered. */
export class PeekWidget extends WidgetType {
  readonly hunk: DocHunk;
  readonly index: number;
  readonly total: number;
  readonly line: number;
  private readonly lineKey: string;
  constructor(
    model: PeekModel,
    private readonly actions: PeekActions,
  ) {
    super();
    ({
      hunk: this.hunk,
      index: this.index,
      total: this.total,
      line: this.line,
    } = model);
    this.lineKey = actions
      .lines(model.hunk)
      .map((row) => `${row.kind}:${row.text}`)
      .join("\n");
  }
  override eq(other: PeekWidget): boolean {
    return (
      other.hunk.from === this.hunk.from &&
      other.hunk.to === this.hunk.to &&
      other.hunk.old === this.hunk.old &&
      other.hunk.kind === this.hunk.kind &&
      other.index === this.index &&
      other.total === this.total &&
      other.line === this.line &&
      other.lineKey === this.lineKey
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = `mw-git-peek mw-git-peek-${this.hunk.kind}`;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Git change");
    root.append(this.header(view), this.body());
    return root;
  }
  private header(view: EditorView): HTMLElement {
    const head = document.createElement("div");
    head.className = "mw-git-peek-head";
    const title = head.appendChild(document.createElement("span"));
    title.className = "mw-git-peek-title";
    title.textContent = `Line ${this.line} · ${this.hunk.kind}`;
    const detail = head.appendChild(document.createElement("span"));
    detail.className = "mw-git-peek-detail";
    detail.textContent = `${this.index + 1} of ${this.total} · ${this.actions.comparisonLabel()}`;
    head.appendChild(document.createElement("span")).className =
      "mw-git-peek-space";
    this.controls(head, view);
    return head;
  }
  private controls(head: HTMLElement, view: EditorView): void {
    addButton(head, {
      label: "Previous change",
      text: "↑",
      run: () => this.actions.move(view, -1),
    });
    addButton(head, {
      label: "Next change",
      text: "↓",
      run: () => this.actions.move(view, 1),
    });
    addButton(head, {
      label: "Revert this change",
      text: "Revert",
      run: () => this.actions.revert(view, this.hunk),
      disabled: !this.actions.canRevert(this.hunk),
    });
    addButton(head, {
      label: "Stage this change",
      text: "Stage",
      run: () => undefined,
      disabled: !this.actions.canStage(this.hunk),
    });
    addButton(head, {
      label: "Open Full Diff",
      text: "Open Full Diff",
      run: () => this.actions.openFull(view),
    });
    addButton(head, {
      label: "Close",
      text: "✕",
      run: () => this.actions.close(view),
    });
  }
  private body(): HTMLElement {
    const body = document.createElement("div");
    body.className = "mw-git-peek-unified";
    for (const row of unifiedRows(this.actions.lines(this.hunk))) {
      body.append(unifiedLine(row.kind, row.original, row.modified, row.text));
    }
    return body;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function unifiedLine(
  kind: string,
  original: number | undefined,
  modified: number | undefined,
  text: string,
): HTMLElement {
  const line = document.createElement("div");
  line.className = `mw-git-peek-line is-${kind}`;
  const old = line.appendChild(document.createElement("span"));
  old.className = "mw-git-peek-num";
  old.textContent = original === undefined ? "" : String(original);
  const next = line.appendChild(document.createElement("span"));
  next.className = "mw-git-peek-num";
  next.textContent = modified === undefined ? "" : String(modified);
  const value = line.appendChild(document.createElement("span"));
  value.className = "mw-git-peek-text";
  value.textContent = text;
  return line;
}

function addButton(
  head: HTMLElement,
  button: {
    label: string;
    text: string;
    run: () => void;
    disabled?: boolean;
  },
): void {
  const element = head.appendChild(document.createElement("button"));
  element.type = "button";
  element.className = "mw-git-peek-button";
  element.title = button.label;
  element.setAttribute("aria-label", button.label);
  element.textContent = button.text;
  element.disabled = button.disabled ?? false;
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (!element.disabled) {
      button.run();
    }
  });
}
