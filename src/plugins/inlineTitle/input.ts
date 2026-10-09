import type { EditorView } from "@codemirror/view";
import type { TitleFocus, TitleValue } from "./protocol";
export type { TitleFocus, TitleValue } from "./protocol";
export interface TitleActions {
  rename(title: string, focus?: TitleFocus): void;
  focus(target: TitleFocus): void;
}

export class TitleInput {
  readonly root = document.createElement("div");
  private readonly input = document.createElement("textarea");
  private readonly measure = document.createElement("div");
  private readonly events = new AbortController();
  private confirmed: string;
  private isPending = false;
  private isComposing = false;
  private afterCommit?: TitleFocus;
  private blurFocus?: TitleFocus;

  constructor(
    private readonly view: EditorView,
    value: TitleValue,
    private readonly actions: TitleActions,
  ) {
    this.confirmed = value.title;
    this.createControls();
    this.bindInput();
    this.resize();
  }

  private createControls(): void {
    this.root.className = "file-title";
    this.input.rows = 1;
    this.input.value = this.confirmed;
    this.input.setAttribute("aria-label", "Note title");
    this.input.setAttribute("aria-multiline", "false");
    this.input.enterKeyHint = "done";
    this.input.spellcheck = false;
    // Out of the Tab order: a stray Tab or Shift+Tab must never land in the
    // title, where the next keystrokes would rename the note. Click or
    // ArrowUp from the first line still reach it, as in Obsidian.
    this.input.tabIndex = -1;
    this.measure.className = "file-title-measure";
    this.measure.setAttribute("aria-hidden", "true");
    this.root.append(this.input, this.measure);
  }

  private resize(): void {
    this.measure.textContent = this.input.value + " ";
    this.view.requestMeasure();
  }
  private clearError(): void {
    this.input.removeAttribute("aria-invalid");
    this.input.removeAttribute("title");
  }
  private reject(error: string): void {
    if (document.activeElement === this.input) {
      this.input.setAttribute("aria-invalid", "true");
      this.input.title = error;
    } else {
      this.input.value = this.confirmed;
      this.clearError();
      this.resize();
    }
  }

  private commit(next?: TitleFocus, focusOnSuccess = true): void {
    if (this.isPending || this.isComposing || !this.input.isConnected) {
      return;
    }
    const title = this.input.value.trim();
    this.input.value = title || this.confirmed;
    this.resize();
    if (title.length > 255) {
      this.reject("The note title must contain at most 255 characters.");
      return;
    }
    this.clearError();
    if (title && title !== this.confirmed) {
      this.isPending = true;
      if (focusOnSuccess && next !== undefined) {
        this.afterCommit = next;
      } else {
        delete this.afterCommit;
      }
      this.input.readOnly = true;
      this.input.setAttribute("aria-busy", "true");
      this.actions.rename(title, next);
    } else if (next && focusOnSuccess) {
      this.actions.focus(next);
    }
  }

  update(value: TitleValue): void {
    this.confirmed = value.title;
    this.isPending = false;
    this.input.readOnly = false;
    this.input.removeAttribute("aria-busy");
    const next = this.afterCommit;
    delete this.afterCommit;
    if (value.error) {
      this.reject(value.error);
      return;
    }
    this.input.value = this.confirmed;
    this.clearError();
    this.resize();
    if (next && document.activeElement === this.input) {
      this.actions.focus(next);
    }
  }

  private onLastLine(): boolean {
    const text = this.measure.firstChild;
    if (!text) {
      return true;
    }
    const range = document.createRange();
    range.setStart(text, this.input.selectionEnd);
    range.collapse(true);
    const caret = range.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(this.input).lineHeight);
    return (
      caret.bottom + line / 2 >= this.measure.getBoundingClientRect().bottom
    );
  }

  private bindInput(): void {
    const options = { signal: this.events.signal };
    this.input.addEventListener(
      "input",
      () => {
        this.clearError();
        this.resize();
      },
      options,
    );
    this.input.addEventListener(
      "blur",
      () => {
        if (this.input.hasAttribute("aria-invalid")) {
          this.input.value = this.confirmed;
          this.clearError();
          this.resize();
        } else {
          this.commit(this.blurFocus, false);
        }
      },
      options,
    );
    this.input.addEventListener(
      "compositionstart",
      () => {
        this.isComposing = true;
      },
      options,
    );
    this.input.addEventListener(
      "compositionend",
      () => {
        this.isComposing = false;
        this.resize();
        if (document.activeElement !== this.input) {
          this.commit();
        }
      },
      options,
    );
    this.input.addEventListener(
      "keydown",
      (event) => this.keydown(event),
      options,
    );
  }

  private keydown(event: KeyboardEvent): void {
    if (event.isComposing || this.isComposing) {
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.commit("body");
    } else if (event.key === "Escape") {
      if (!this.isPending) {
        this.input.value = this.confirmed;
        this.clearError();
        this.resize();
      }
      this.actions.focus("body");
    } else if (event.key === "ArrowDown" && this.onLastLine()) {
      this.blurFocus = event.altKey ? "body" : "properties";
      this.actions.focus(this.blurFocus);
      delete this.blurFocus;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  dispose(): void {
    this.events.abort();
  }
}
