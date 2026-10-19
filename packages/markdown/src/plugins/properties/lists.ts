import { bindPropertyChips, itemOccurrence } from "./chips";
import { frontmatter, type PropertyScalar } from "../../markdown/properties";
import type { PropertyContext } from "./context";
import { bindListInput } from "./list-input";
import { listValues, normalizeListInput } from "./list-values";
import {
  inputText,
  setInputText,
  setInputValidity,
  reportInputValidity,
} from "./value-input";

const bound = new WeakSet<HTMLElement>();
const lifetimes = new WeakMap<HTMLElement, Map<HTMLElement, () => void>>();

type PropertyEditor = NonNullable<PropertyContext["propertyEditor"]>;
interface ListOptions {
  container: HTMLElement;
  list: HTMLElement;
  key: string;
  original: readonly PropertyScalar[];
  source: string;
  editor?: PropertyEditor;
  openMenu: PropertyContext["openMenu"];
  copy: PropertyContext["copy"];
}

export function bindPropertyLists(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): () => void {
  const cleanups = retainedLists(container);
  const properties = frontmatter(source);
  const editor =
    context.propertyEditor?.source === context.source
      ? context.propertyEditor
      : undefined;
  container
    .querySelectorAll<HTMLElement>("[data-property-list]")
    .forEach((list) => {
      if (bound.has(list)) {
        return;
      }
      bound.add(list);
      const key = list.dataset.propertyList!;
      const original = listValues(properties?.values?.[key]);
      if (!original) {
        return;
      }
      const binding = new PropertyList({
        container,
        list,
        key,
        original,
        source,
        ...(editor && { editor }),
        openMenu: context.openMenu,
        copy: context.copy,
      });
      cleanups.set(list, binding.bind());
    });
  return () => {
    cleanups.forEach((close) => close());
    cleanups.clear();
    lifetimes.delete(container);
  };
}

function retainedLists(container: HTMLElement): Map<HTMLElement, () => void> {
  const cleanups =
    lifetimes.get(container) ?? new Map<HTMLElement, () => void>();
  lifetimes.set(container, cleanups);
  for (const [list, close] of cleanups) {
    if (!container.contains(list)) {
      close();
      cleanups.delete(list);
    }
  }
  return cleanups;
}

/** One list reconciles every edit with the latest header rather than its rendered snapshot. */
class PropertyList {
  private readonly input: HTMLElement;
  private committing = false;
  constructor(private readonly options: ListOptions) {
    this.input = options.list.querySelector<HTMLElement>(
      "[data-property-list-input]",
    )!;
    this.input.hidden = !options.editor;
  }

  private current() {
    return frontmatter(
      this.options.editor?.currentSource?.() ?? this.options.source,
    );
  }
  private values() {
    return listValues(this.current()?.values?.[this.options.key]);
  }

  bind(): () => void {
    const { container, list, key, original, editor, openMenu, copy } =
      this.options;
    this.bindRemoveButtons();
    const close = bindPropertyChips({
      container,
      list,
      key,
      original,
      openMenu,
      actions: {
        editable: !!editor,
        values: () => this.values(),
        value: (input) => this.pendingValue(input),
        update: (values, refocus) => this.update(values, refocus),
        remove: (index, previous) => this.remove(index, previous),
        refresh: () => editor?.refresh?.(),
        copy: (text) => copy?.(text),
        action: (action) => editor?.action?.(action),
      },
    });
    bindListInput(list, this.input, {
      commit: (refocus) => this.commit(refocus),
      save: () => editor?.action?.("save"),
      leave: () => editor?.focusBody?.(),
    });
    return close;
  }

  private update(next: PropertyScalar[], refocus = true): boolean {
    const { container, editor, key } = this.options;
    const owner = container.closest(".cm-editor");
    this.input.dataset.propertyCommitting = "true";
    let applied: boolean | undefined;
    try {
      applied = editor?.set(this.current()?.raw ?? "", key, next);
    } finally {
      delete this.input.dataset.propertyCommitting;
    }
    if (!applied) {
      setInputValidity(
        this.input,
        "The properties changed. Reopen this field and try again.",
      );
      reportInputValidity(this.input);
      return false;
    }
    if (refocus) {
      owner
        ?.querySelector<HTMLElement>(
          `[data-property-list="${CSS.escape(key)}"] [data-property-list-input]`,
        )
        ?.focus();
    }
    return true;
  }

  private pendingValue(input: HTMLElement): string | undefined {
    const value = normalizeListInput(this.options.key, inputText(input));
    if (value === undefined) {
      setInputValidity(
        input,
        "Use a tag without spaces or punctuation other than -, _ and /.",
      );
      reportInputValidity(input);
    }
    return value;
  }

  private commit(refocus = false): boolean {
    if (this.committing || !this.options.editor) {
      return true;
    }
    const value = this.pendingValue(this.input);
    const latest = this.values();
    if (value === undefined || !latest) {
      return false;
    }
    if (!value || latest.includes(value)) {
      setInputText(this.input, "");
      this.options.editor.refresh?.();
      return true;
    }
    this.committing = true;
    try {
      return this.update([...latest, value], refocus);
    } finally {
      this.committing = false;
    }
  }

  private remove(index: number, previous = false): void {
    const pending = this.pendingValue(this.input);
    const latest = this.values();
    if (pending === undefined || !latest) {
      return;
    }
    const at = itemOccurrence(this.options.original, latest, index);
    if (at < 0) {
      this.input.focus();
      setInputValidity(
        this.input,
        "This item changed in another editor. Finish the pending entry or press Escape.",
      );
      reportInputValidity(this.input);
      return;
    }
    const next = latest.filter((_value, index) => index !== at);
    if (pending && !next.includes(pending)) {
      next.push(pending);
    }
    if (this.update(next, !previous) && previous) {
      this.focusPrevious(at);
    }
  }

  private focusPrevious(index: number): void {
    const current = this.options.container.querySelector<HTMLElement>(
      `[data-property-list="${CSS.escape(this.options.key)}"]`,
    );
    const chip = current?.querySelector<HTMLElement>(
      `[data-property-chip="${Math.max(0, index - 1)}"]`,
    );
    (
      chip ?? current?.querySelector<HTMLElement>("[data-property-list-input]")
    )?.focus();
  }

  private bindRemoveButtons(): void {
    this.options.list
      .querySelectorAll<HTMLButtonElement>("[data-property-remove]")
      .forEach((button) => {
        button.hidden = !this.options.editor;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.remove(Number(button.dataset.propertyRemove));
        });
      });
  }
}
