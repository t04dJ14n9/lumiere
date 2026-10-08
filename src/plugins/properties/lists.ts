import { bindPropertyChips, itemOccurrence } from "./chips";
import { frontmatter, type PropertyScalar } from "../../markdown/properties";
import { validTag } from "../../markdown/tags/grammar";
import type { PropertyContext } from "./context";
import { bindListInput } from "./list-input";
import { listValues } from "./list-values";

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
        editor,
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
  private readonly input: HTMLInputElement;
  private committing = false;
  constructor(private readonly options: ListOptions) {
    this.input = options.list.querySelector<HTMLInputElement>("input")!;
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
      this.input.setCustomValidity(
        "The properties changed. Reopen this field and try again.",
      );
      this.input.reportValidity();
      return false;
    }
    if (refocus) {
      owner
        ?.querySelector<HTMLInputElement>(
          `[data-property-list="${CSS.escape(key)}"] input`,
        )
        ?.focus();
    }
    return true;
  }

  private pendingValue(input: HTMLInputElement): string | undefined {
    const isTag = this.options.key.toLowerCase() === "tags";
    const value = isTag
      ? input.value.trim().replace(/^#/, "")
      : input.value.trim();
    if (value && isTag && !validTag(value)) {
      input.setCustomValidity(
        "Use a tag without spaces or punctuation other than -, _ and /.",
      );
      input.reportValidity();
      return undefined;
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
      this.input.value = "";
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
      this.input.setCustomValidity(
        "This item changed in another editor. Finish the pending entry or press Escape.",
      );
      this.input.reportValidity();
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
    (chip ?? current?.querySelector<HTMLInputElement>("input"))?.focus();
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
