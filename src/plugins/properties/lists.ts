import { bindPropertyChips, itemOccurrence } from "./chips";
import { frontmatter, type PropertyScalar } from "../../markdown/properties";
import { validTag } from "../../markdown/tags/grammar";
import type { PropertyContext } from "./context";

const bound = new WeakSet<HTMLElement>();
const lifetimes = new WeakMap<HTMLElement, Map<HTMLElement, () => void>>();
function listValues(raw: unknown): PropertyScalar[] | undefined {
  const values =
    raw === null || raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return values.every(
    (value) =>
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)),
  )
    ? values
    : undefined;
}

export function bindPropertyLists(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): () => void {
  const cleanups =
    lifetimes.get(container) ?? new Map<HTMLElement, () => void>();
  lifetimes.set(container, cleanups);
  for (const [list, close] of cleanups) {
    if (!container.contains(list)) {
      close();
      cleanups.delete(list);
    }
  }
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
      const originalValues = listValues(properties?.values?.[key]);
      const current = () => frontmatter(editor?.currentSource?.() ?? source);
      const values = () => listValues(current()?.values?.[key]);
      if (!originalValues) {
        return;
      }
      const input = list.querySelector<HTMLInputElement>("input")!;
      input.hidden = !editor;
      const update = (next: PropertyScalar[], refocus = true): boolean => {
        const owner = container.closest(".cm-editor");
        input.dataset.propertyCommitting = "true";
        let applied: boolean | undefined;
        try {
          applied = editor?.set(current()?.raw ?? "", key, next);
        } finally {
          delete input.dataset.propertyCommitting;
        }
        if (!applied) {
          input.setCustomValidity(
            "The properties changed. Reopen this field and try again.",
          );
          input.reportValidity();
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
      };
      const pendingValue = (input: HTMLInputElement): string | undefined => {
        const value =
          key.toLowerCase() === "tags"
            ? input.value.trim().replace(/^#/, "")
            : input.value.trim();
        if (value && key.toLowerCase() === "tags" && !validTag(value)) {
          input.setCustomValidity(
            "Use a tag without spaces or punctuation other than -, _ and /.",
          );
          input.reportValidity();
          return undefined;
        }
        return value;
      };
      let committing = false;
      const commit = (refocus = false): boolean => {
        if (committing || !editor) {
          return true;
        }
        const value = pendingValue(input);
        const latest = values();
        if (value === undefined || !latest) {
          return false;
        }
        if (!value || latest.includes(value)) {
          input.value = "";
          editor?.refresh?.();
          return true;
        }
        committing = true;
        try {
          return update([...latest, value], refocus);
        } finally {
          committing = false;
        }
      };
      const remove = (index: number, previous = false): void => {
        const pending = pendingValue(input);
        const latest = values();
        if (pending === undefined || !latest) {
          return;
        }
        const at = itemOccurrence(originalValues, latest, index);
        if (at < 0) {
          input.focus();
          input.setCustomValidity(
            "This item changed in another editor. Finish the pending entry or press Escape.",
          );
          input.reportValidity();
          return;
        }
        const next = latest.filter((_value, index) => index !== at);
        if (pending && !next.includes(pending)) {
          next.push(pending);
        }
        if (update(next, !previous) && previous) {
          const current = container.querySelector<HTMLElement>(
            `[data-property-list="${CSS.escape(key)}"]`,
          );
          const chip = current?.querySelector<HTMLElement>(
            `[data-property-chip="${Math.max(0, at - 1)}"]`,
          );
          (chip ?? current?.querySelector<HTMLInputElement>("input"))?.focus();
        }
      };
      list
        .querySelectorAll<HTMLButtonElement>("[data-property-remove]")
        .forEach((button) => {
          button.hidden = !editor;
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            remove(Number(button.dataset.propertyRemove));
          });
        });
      cleanups.set(
        list,
        bindPropertyChips(
          container,
          list,
          key,
          originalValues,
          {
            editable: !!editor,
            values,
            value: pendingValue,
            update,
            remove,
            refresh: () => editor?.refresh?.(),
            copy: (text) => context.copy?.(text),
            action: (action) => editor?.action?.(action),
          },
          context.openMenu,
        ),
      );
      input.addEventListener("input", () => input.setCustomValidity(""));
      input.addEventListener("compositionstart", () => {
        input.dataset.propertyEditing = "true";
      });
      input.addEventListener("compositionend", () => {
        delete input.dataset.propertyEditing;
      });
      input.addEventListener("blur", (event) => {
        if (
          event.relatedTarget instanceof Element &&
          list.contains(event.relatedTarget) &&
          event.relatedTarget.closest("[data-property-remove]")
        ) {
          return;
        }
        commit();
      });
      input.addEventListener("property-commit", (event) => {
        if (!commit()) {
          event.preventDefault();
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.isComposing) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          input.value = "";
          input.setCustomValidity("");
          input.blur();
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (commit()) {
            editor?.action?.("save");
          }
          return;
        }
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        commit(true);
      });
    });
  return () => {
    cleanups.forEach((close) => close());
    cleanups.clear();
    lifetimes.delete(container);
  };
}
