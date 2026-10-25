import { createChildEl, getDomDocument } from "./dom-helpers";
import type { Editor, EditorPosition } from "./editor-bridge";
import { Component, Scope } from "./obsidian-core";
import type { TFile } from "./obsidian-files";
import {
  prepareFuzzySearch,
  renderMatches,
  type SearchResult,
} from "./obsidian-metadata";
import { setIcon } from "./obsidian-ui";
import type { App } from "./obsidian-workspace";

export class Notice {
  noticeEl: HTMLElement;
  containerEl: HTMLElement;
  messageEl: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(message: string | DocumentFragment, duration = 4000) {
    const doc = getDomDocument();
    if (doc) {
      let container = doc.querySelector<HTMLElement>(".notice-container");
      if (!container && doc.body) {
        container = createChildEl(doc.body, "div", { cls: "notice-container" });
      }
      this.containerEl = container ?? doc.createElement("div");
      this.noticeEl = createChildEl(this.containerEl, "div", { cls: "notice" });
      this.messageEl = createChildEl(this.noticeEl, "div", {
        cls: "notice-message",
      });
      this.setMessage(message);
      if (duration > 0) {
        this.timer = setTimeout(() => this.hide(), duration);
      }
    } else {
      this.containerEl = {} as HTMLElement;
      this.noticeEl = {} as HTMLElement;
      this.messageEl = {} as HTMLElement;
    }
  }

  setMessage(message: string | DocumentFragment): this {
    if (typeof message === "string") {
      this.messageEl.textContent = message;
    } else {
      this.messageEl.textContent = "";
      this.messageEl.appendChild(message);
    }
    return this;
  }

  hide(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.noticeEl?.parentNode?.removeChild(this.noticeEl);
  }
}

export class Modal {
  app: App;
  scope: Scope;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  shouldRestoreSelection = false;

  constructor(app: App) {
    this.app = app;
    this.scope = new Scope(app?.scope);
    if (getDomDocument()) {
      this.containerEl = getDomDocument().createElement("div");
      this.containerEl.className = "modal-container mod-dim";
      this.modalEl = createChildEl(this.containerEl, "div", { cls: "modal" });
      this.titleEl = createChildEl(this.modalEl, "div", { cls: "modal-title" });
      this.contentEl = createChildEl(this.modalEl, "div", {
        cls: "modal-content",
      });
    } else {
      this.containerEl = {} as HTMLElement;
      this.modalEl = {} as HTMLElement;
      this.titleEl = {} as HTMLElement;
      this.contentEl = {} as HTMLElement;
    }
  }

  open(): void {
    if (getDomDocument().body) {
      getDomDocument().body.appendChild(this.containerEl);
    }
    this.app?.keymap?.pushScope(this.scope);
    this.onOpen();
  }

  close(): void {
    this.onClose();
    this.app?.keymap?.popScope(this.scope);
    this.containerEl?.parentNode?.removeChild(this.containerEl);
  }

  onOpen(): void {}

  onClose(): void {
    while (this.contentEl?.firstChild) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }
  }

  setTitle(title: string): this {
    this.titleEl.textContent = title;
    return this;
  }

  setContent(content: string | DocumentFragment): this {
    if (typeof content === "string") {
      this.contentEl.textContent = content;
    } else {
      this.contentEl.textContent = "";
      this.contentEl.appendChild(content);
    }
    return this;
  }
}

export class ConfirmationModal extends Modal {}

export abstract class SuggestModal<T> extends Modal {
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;
  emptyStateText = "No match found.";
  limit = 100;

  constructor(app: App) {
    super(app);
    this.inputEl = createChildEl(this.modalEl, "input", {
      cls: "prompt-input",
      type: "text",
    });
    this.resultContainerEl = createChildEl(this.modalEl, "div", {
      cls: "prompt-results",
    });
  }

  setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder;
  }

  setInstructions(
    _instructions: Array<{ command: string; purpose: string }>,
  ): void {}

  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export interface FuzzyMatch<T> {
  item: T;
  match: SearchResult;
}

export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;

  override getSuggestions(query: string): FuzzyMatch<T>[] {
    const matcher = prepareFuzzySearch(query);
    const out: FuzzyMatch<T>[] = [];
    for (const item of this.getItems()) {
      const match = matcher(this.getItemText(item));
      if (match) {
        out.push({ item, match });
      }
    }
    return out;
  }

  override renderSuggestion(item: FuzzyMatch<T>, el: HTMLElement): void {
    renderMatches(el, this.getItemText(item.item), item.match.matches);
  }

  override onChooseSuggestion(
    item: FuzzyMatch<T>,
    evt: MouseEvent | KeyboardEvent,
  ): void {
    this.onChooseItem(item.item, evt);
  }
}

export class MenuItem {
  dom: HTMLElement;
  titleEl: HTMLElement;
  iconEl: HTMLElement;
  private callback?: (evt: MouseEvent | KeyboardEvent) => unknown;
  private disabled = false;

  constructor(menu: Menu) {
    this.dom = createChildEl(menu.dom, "div", { cls: "menu-item" });
    this.iconEl = createChildEl(this.dom, "div", { cls: "menu-item-icon" });
    this.titleEl = createChildEl(this.dom, "div", { cls: "menu-item-title" });
    this.dom.addEventListener("click", (evt) => {
      if (!this.disabled) {
        this.callback?.(evt);
        menu.hide();
      }
    });
  }

  setTitle(title: string | DocumentFragment): this {
    if (typeof title === "string") {
      this.titleEl.textContent = title;
    } else {
      this.titleEl.textContent = "";
      this.titleEl.appendChild(title);
    }
    return this;
  }

  setIcon(icon: string | null): this {
    if (icon) {
      setIcon(this.iconEl, icon);
    } else {
      this.iconEl.textContent = "";
    }
    return this;
  }

  setChecked(checked: boolean | null): this {
    this.dom.classList.toggle("is-checked", Boolean(checked));
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    this.dom.classList.toggle("is-disabled", disabled);
    return this;
  }

  setIsLabel(isLabel: boolean): this {
    this.dom.classList.toggle("is-label", isLabel);
    return this;
  }

  setWarning(isWarning: boolean): this {
    this.dom.classList.toggle("is-warning", isWarning);
    return this;
  }

  setSection(section: string): this {
    this.dom.dataset.section = section;
    return this;
  }

  onClick(callback: (evt: MouseEvent | KeyboardEvent) => unknown): this {
    this.callback = callback;
    return this;
  }

  setSubmenu(): Menu {
    return new Menu();
  }
}

export class MenuSeparator {
  dom: HTMLElement;

  constructor(menu: Menu) {
    this.dom = createChildEl(menu.dom, "div", { cls: "menu-separator" });
  }
}

export class Menu extends Component {
  dom: HTMLElement;
  items: Array<MenuItem | MenuSeparator> = [];
  private hideCallback?: () => unknown;

  constructor() {
    super();
    this.dom = getDomDocument().createElement("div");
    if (this.dom.classList) {
      this.dom.classList.add("menu");
    }
  }

  setNoIcon(): this {
    this.dom.classList?.add("mod-no-icon");
    return this;
  }

  setUseNativeMenu(_useNativeMenu: boolean): this {
    return this;
  }

  addItem(cb: (item: MenuItem) => unknown): this {
    const item = new MenuItem(this);
    this.items.push(item);
    cb(item);
    return this;
  }

  addSeparator(): this {
    const sep = new MenuSeparator(this);
    this.items.push(sep);
    return this;
  }

  showAtMouseEvent(evt: MouseEvent): this {
    return this.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  showAtPosition(position: { x: number; y: number }): this {
    if (getDomDocument().body) {
      this.dom.style.left = `${position.x}px`;
      this.dom.style.top = `${position.y}px`;
      getDomDocument().body.appendChild(this.dom);
    }
    void this.load();
    return this;
  }

  hide(): this {
    this.dom?.parentNode?.removeChild(this.dom);
    this.hideCallback?.();
    this.unload();
    return this;
  }

  close(): void {
    this.hide();
  }

  onHide(callback: () => unknown): void {
    this.hideCallback = callback;
  }
}

export abstract class PopoverSuggest<T> {
  app: App;
  scope: Scope;

  constructor(app: App, scope?: Scope) {
    this.app = app;
    this.scope = scope ?? new Scope(app?.scope);
  }

  open(): void {}
  close(): void {}
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class AbstractInputSuggest<T> extends PopoverSuggest<T> {
  limit = 100;
  private value = "";

  constructor(
    app: App,
    private readonly textInputEl: HTMLInputElement | HTMLDivElement,
  ) {
    super(app);
  }

  setValue(value: string): void {
    this.value = value;
    if ("value" in this.textInputEl) {
      this.textInputEl.value = value;
    } else {
      this.textInputEl.textContent = value;
    }
  }

  getValue(): string {
    return "value" in this.textInputEl
      ? this.textInputEl.value
      : (this.textInputEl.textContent ?? this.value);
  }
}

export interface EditorSuggestTriggerInfo {
  start: EditorPosition;
  end: EditorPosition;
  query: string;
}

export interface EditorSuggestContext extends EditorSuggestTriggerInfo {
  editor: Editor;
  file: TFile;
}

export abstract class EditorSuggest<T> extends PopoverSuggest<T> {
  context: EditorSuggestContext | null = null;
  limit = 100;

  setInstructions(
    _instructions: Array<{ command: string; purpose: string }>,
  ): void {}

  abstract onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null,
  ): EditorSuggestTriggerInfo | null;

  abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
}

export class HoverPopover extends Component {
  hoverEl: HTMLElement;

  constructor(_parent: unknown, _targetEl: HTMLElement | null) {
    super();
    this.hoverEl = getDomDocument().createElement("div");
  }
}
