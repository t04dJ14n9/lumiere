/**
 * What VS Code's window shows for an extension (messages, prompts, quick
 * picks), drawn inside the page: DSH has no API for them. Styled with the
 * page's `--vscode-*` variables, so they follow DSH's theme.
 */
import type { PageFrame, PickRow, UiRequest } from "../protocol";

type Send = (frame: PageFrame) => void;
type Prompt = Extract<UiRequest, { type: "ask" | "input" | "pick" }>;

const STYLE = `
.lumiere-dsh-toast{position:fixed;bottom:12px;right:12px;max-width:min(420px,80vw);padding:8px 12px;border-radius:6px;z-index:1000;
  background:var(--vscode-editorWidget-background);color:var(--vscode-editorWidget-foreground);border:1px solid var(--vscode-widget-border);font:13px var(--vscode-font-family)}
.lumiere-dsh-toast.error{border-color:var(--vscode-errorForeground)}
.lumiere-dsh-prompt{position:fixed;top:12px;left:50%;transform:translateX(-50%);width:min(520px,92vw);z-index:1001;padding:8px;border-radius:8px;
  background:var(--vscode-editorWidget-background);color:var(--vscode-editorWidget-foreground);border:1px solid var(--vscode-widget-border);
  box-shadow:0 4px 16px var(--vscode-widget-shadow);font:13px var(--vscode-font-family)}
.lumiere-dsh-prompt p{margin:4px 4px 8px}
.lumiere-dsh-prompt input{box-sizing:border-box;width:100%;padding:6px 8px;border-radius:4px;font:inherit;
  background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}
.lumiere-dsh-prompt .error{color:var(--vscode-errorForeground);margin:6px 4px 0}
.lumiere-dsh-prompt ul{list-style:none;margin:6px 0 0;padding:0;max-height:50vh;overflow:auto}
.lumiere-dsh-prompt li{padding:5px 8px;border-radius:4px;cursor:pointer}
.lumiere-dsh-prompt li[aria-selected=true]{background:var(--vscode-list-activeSelectionBackground)}
.lumiere-dsh-prompt li small{margin-left:8px;color:var(--vscode-descriptionForeground)}
.lumiere-dsh-prompt .actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}
.lumiere-dsh-prompt button{padding:4px 12px;border-radius:4px;border:1px solid var(--vscode-button-border);font:inherit;cursor:pointer;
  background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.lumiere-dsh-prompt button:first-child{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
`;

export function createUi(send: Send): (request: UiRequest) => void {
  installStyle();
  let picker: Picker | undefined;
  return (request) => {
    switch (request.type) {
      case "toast":
        return toast(request.kind, request.message);
      case "clipboard":
        return void copy(request.text);
      case "open":
        return window.parent.postMessage(
          {
            type: "lumiere:open",
            path: request.path,
            fragment: request.fragment,
          },
          location.origin,
        );
      case "external":
        return void window.open(request.href, "_blank", "noopener,noreferrer");
      case "pickItems":
        return picker?.id === request.id
          ? picker.update(request.items)
          : undefined;
      case "pick":
        picker = new Picker(request, send);
        return;
      default:
        return prompt(request, send);
    }
  };
}

function installStyle(): void {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
}

function toast(kind: "info" | "error", message: string): void {
  const element = document.createElement("div");
  element.className = `lumiere-dsh-toast ${kind}`;
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), kind === "error" ? 8000 : 4000);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Without a recent gesture the async clipboard refuses; the old copy still works.
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

/** One prompt box; Escape dismisses it and answers null. */
function frame(
  id: number,
  send: Send,
): { box: HTMLElement; close(value: string | number | null): void } {
  const box = document.createElement("div");
  box.className = "lumiere-dsh-prompt";
  box.setAttribute("role", "dialog");
  let closed = false;
  const close = (value: string | number | null) => {
    if (!closed) {
      closed = true;
      box.remove();
      send({ ch: "ui", data: { type: "answer", id, value } });
    }
  };
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(null);
    }
  });
  document.body.append(box);
  return { box, close };
}

function prompt(request: Exclude<Prompt, { type: "pick" }>, send: Send): void {
  const { box, close } = frame(request.id, send);
  const message = document.createElement("p");
  message.textContent =
    request.type === "ask" ? request.message : request.prompt;
  box.append(message);
  if (request.type === "ask") {
    const actions = document.createElement("div");
    actions.className = "actions";
    for (const action of [...request.actions, "Cancel"]) {
      const button = document.createElement("button");
      button.textContent = action;
      button.addEventListener("click", () =>
        close(action === "Cancel" ? null : action),
      );
      actions.append(button);
    }
    box.append(actions);
    actions.querySelector("button")?.focus();
    return;
  }
  const field = document.createElement("input");
  field.value = request.value;
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      close(field.value);
    }
  });
  box.append(field);
  if (request.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = request.error;
    box.append(error);
  }
  field.focus();
  field.select();
}

/** A quick pick: the host filters as the reader types; arrows and Enter choose. */
class Picker {
  readonly id: number;
  private rows: PickRow[];
  private selected = 0;
  private readonly list = document.createElement("ul");
  private readonly close: (value: string | number | null) => void;

  constructor(request: Extract<UiRequest, { type: "pick" }>, send: Send) {
    this.id = request.id;
    this.rows = request.items;
    const { box, close } = frame(request.id, send);
    this.close = close;
    const field = document.createElement("input");
    field.placeholder = request.placeholder;
    field.addEventListener("input", () =>
      send({
        ch: "ui",
        data: { type: "query", id: this.id, query: field.value },
      }),
    );
    field.addEventListener("keydown", (event) => this.key(event));
    this.list.setAttribute("role", "listbox");
    box.append(field, this.list);
    this.render();
    field.focus();
  }

  update(rows: PickRow[]): void {
    this.rows = rows;
    this.selected = 0;
    this.render();
  }

  private key(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.selected = Math.max(
        0,
        Math.min(this.rows.length - 1, this.selected + step),
      );
      this.render();
    } else if (event.key === "Enter" && this.rows.length > 0) {
      this.close(this.selected);
    }
  }

  private render(): void {
    this.list.replaceChildren(
      ...this.rows.map((row, index) => {
        const item = document.createElement("li");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === this.selected));
        item.textContent = row.label;
        if (row.description) {
          const description = document.createElement("small");
          description.textContent = row.description;
          item.append(description);
        }
        item.addEventListener("click", () => this.close(index));
        return item;
      }),
    );
  }
}
