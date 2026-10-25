import { FindNavigation, findNavigationStep } from "./find-navigation";
import { EditorSelection } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import { countLabel, countMatches } from "./find-count";
import { readFindCaret, restoreFindCaret } from "./find-caret";

const panels = new WeakMap<EditorView, FindPanel>();

function button(
  label: string,
  title: string,
  run: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.title = title;
  element.setAttribute("aria-label", title);
  element.addEventListener("click", run);
  return element;
}

function field(placeholder: string, name: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  input.name = name;
  input.spellcheck = false;
  return input;
}

/** Obsidian-style find bar: field, match count, previous/next, replace row. */
export class FindPanel implements Panel {
  readonly dom = document.createElement("div");
  readonly top = true;
  private readonly find = field("Find...", "search");
  private readonly replace = field("Replace...", "replace");
  private readonly count = document.createElement("span");
  private readonly replaceRow = document.createElement("div");
  private readonly caseToggle: HTMLButtonElement;
  private readonly navigation: FindNavigation;
  private readonly inputLifetime = new AbortController();

  static of(view: EditorView): FindPanel | undefined {
    return panels.get(view);
  }

  constructor(private readonly view: EditorView) {
    this.navigation = new FindNavigation(view);
    panels.set(view, this);
    const query = getSearchQuery(view.state);
    this.find.value = query.search;
    this.replace.value = query.replace;
    this.find.setAttribute("main-field", "true");
    this.caseToggle = button("Aa", "Match case", () => this.toggleCase());
    this.caseToggle.setAttribute("aria-pressed", String(query.caseSensitive));
    this.build();
    this.refresh();
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      view.dom.addEventListener(
        type,
        (event) => {
          if (
            event.target instanceof Node &&
            !this.dom.contains(event.target) &&
            !(event instanceof KeyboardEvent && findNavigationStep(event))
          ) {
            this.navigation.cancel();
          }
        },
        { capture: true, signal: this.inputLifetime.signal },
      );
    }
  }

  private build(): void {
    this.dom.className = "mw-find";
    this.dom.setAttribute("role", "search");
    this.count.className = "mw-find-count";
    this.count.setAttribute("aria-live", "polite");
    const findRow = document.createElement("div");
    findRow.className = "mw-find-row";
    findRow.append(
      this.find,
      this.count,
      this.caseToggle,
      button("↑", "Previous match (Shift+Enter)", () => this.next(true)),
      button("↓", "Next match (Enter)", () => this.next()),
      button("⇄", "Toggle replace", () =>
        this.show(this.replaceRow.hidden !== false, false),
      ),
      button("×", "Close (Escape)", () => this.close()),
    );
    this.replaceRow.className = "mw-find-row";
    this.replaceRow.hidden = true;
    this.replaceRow.append(
      this.replace,
      button("Replace", "Replace", () => replaceNext(this.view)),
      button("Replace all", "Replace all", () => replaceAll(this.view)),
    );
    this.dom.append(findRow, this.replaceRow);
    this.find.addEventListener("input", () => this.commit(true));
    this.replace.addEventListener("input", () => this.commit(false));
    this.dom.addEventListener("keydown", (event) => this.keydown(event));
  }

  /** Focuses the find field, optionally with the replace row shown. */
  show(replace: boolean, useSelection = true): void {
    this.replaceRow.hidden = !replace;
    const selected = this.view.state.sliceDoc(
      this.view.state.selection.main.from,
      this.view.state.selection.main.to,
    );
    if (useSelection && selected && !selected.includes("\n")) {
      this.find.value = selected;
      this.commit(false);
    }
    const target = replace && this.find.value ? this.replace : this.find;
    target.focus();
    target.select();
  }

  private query(): SearchQuery {
    return new SearchQuery({
      search: this.find.value,
      replace: this.replace.value,
      caseSensitive: this.caseToggle.getAttribute("aria-pressed") === "true",
    });
  }

  private commit(jump: boolean): void {
    const query = this.query();
    if (query.eq(getSearchQuery(this.view.state))) {
      return;
    }
    // Capture before findNext's selectSearchInput select-alls the field.
    const caret = readFindCaret(this.find);
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    if (jump && query.valid) {
      // Search from where the current match starts, so typing more of the
      // query keeps the match it is extending, as in Obsidian.
      this.navigation.preview(() => {
        const from = this.view.state.selection.main.from;
        this.view.dispatch({ selection: EditorSelection.cursor(from) });
        findNext(this.view);
      });
      // findNext selects [main-field] while focused; restore so typing appends.
      restoreFindCaret(this.find, this.view.root.activeElement, caret);
    }
  }

  private toggleCase(): void {
    const pressed = this.caseToggle.getAttribute("aria-pressed") === "true";
    this.caseToggle.setAttribute("aria-pressed", String(!pressed));
    this.commit(false);
  }

  private keydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && (key === "f" || key === "h")) {
      this.show(key === "h", false);
    } else if (event.key === "Escape") {
      this.close();
    } else if (event.key === "Enter" && event.target === this.find) {
      this.next(event.shiftKey);
    } else if (findNavigationStep(event)) {
      this.next(findNavigationStep(event) === "previous");
    } else if (event.key === "Enter" && event.target === this.replace) {
      (mod ? replaceAll : replaceNext)(this.view);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private close(): void {
    closeSearchPanel(this.view);
    this.view.focus();
  }

  next(reverse = false): boolean {
    return this.navigation.accept(() =>
      (reverse ? findPrevious : findNext)(this.view),
    );
  }

  private refresh(): void {
    const query = getSearchQuery(this.view.state);
    this.count.textContent = countLabel(
      query,
      countMatches(this.view.state, query),
    );
    this.dom.classList.toggle(
      "is-empty",
      Boolean(query.search) && this.count.textContent === "No results",
    );
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      (update.selectionSet && !this.navigation.running)
    ) {
      this.navigation.cancel();
    }
    const changed = update.transactions.some((tr) =>
      tr.effects.some((effect) => effect.is(setSearchQuery)),
    );
    if (changed) {
      const query = getSearchQuery(update.state);
      if (document.activeElement !== this.find) {
        this.find.value = query.search;
      }
      if (document.activeElement !== this.replace) {
        this.replace.value = query.replace;
      }
    }
    if (changed || update.docChanged || update.selectionSet) {
      this.refresh();
    }
  }

  destroy(): void {
    this.inputLifetime.abort();
    this.navigation.cancel();
    panels.delete(this.view);
  }
}
