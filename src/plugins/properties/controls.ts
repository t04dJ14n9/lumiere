import { bindPropertyForm } from "./form";
import { PropertyOrder } from "./order";
import { PropertySelection } from "./selection";
import { frontmatter, type PropertyEdit } from "../../markdown/properties";
import {
  inferPropertyKind,
  propertyKinds,
  propertyKindLabels,
  validPropertyName,
} from "../../markdown/properties/types";
import type { MenuItem } from "../editor/api";
import type { PropertyContext } from "./context";

const boundRows = new WeakSet<HTMLElement>();
const boundWarnings = new WeakSet<HTMLButtonElement>();
const panels = new WeakMap<
  HTMLElement,
  {
    closeMenu?: () => void;
    selection?: PropertySelection;
    order?: PropertyOrder;
  }
>();

/** Structural controls are available only on the note owning this header. */
export function bindPropertyControls(
  container: HTMLElement,
  source: string,
  context: PropertyContext,
): () => void {
  const panel = container.querySelector<HTMLElement>(":scope > .properties");
  const header = frontmatter(source);
  if (!panel || !header?.values) {
    return () => {};
  }
  const editor =
    context.propertyEditor?.source === context.source
      ? context.propertyEditor
      : undefined;
  const add = panel.querySelector<HTMLButtonElement>("[data-property-add]")!;
  const summary = panel.querySelector<HTMLElement>(":scope > summary")!;
  const heading = summary.querySelector<HTMLElement>(
    "[data-properties-heading]",
  )!;
  const notice = panel.querySelector<HTMLElement>(".property-message")!;
  const existing = panels.get(panel);
  const menuState = existing ?? {};
  panels.set(panel, menuState);
  menuState.closeMenu?.();
  const current = () => frontmatter(editor?.currentSource?.() ?? source);
  const report = (message: string): void => {
    notice.textContent = message;
    notice.setAttribute("role", "alert");
  };
  const rowSelector = (key: string): string =>
    `[data-property-row="${CSS.escape(key)}"]`;
  const apply = (
    operation: PropertyEdit,
    focusKey?: string,
    value = false,
  ): boolean => {
    const owner = container.closest(".cm-editor");
    const input = document.activeElement;
    if (input instanceof HTMLInputElement && panel.contains(input)) {
      input.dataset.propertyCommitting = "true";
    }
    let applied: boolean | undefined;
    try {
      applied = editor?.edit?.(current()?.raw ?? "", operation);
    } finally {
      if (input instanceof HTMLInputElement) {
        delete input.dataset.propertyCommitting;
      }
    }
    if (!applied) {
      report(
        "This change could not be applied. Check for duplicate names or YAML aliases, then try again.",
      );
      return false;
    }
    const row =
      focusKey && owner?.querySelector<HTMLElement>(rowSelector(focusKey));
    if (row) {
      if (value) {
        focusValue(row);
      } else {
        row.focus();
      }
    } else {
      owner?.querySelector<HTMLButtonElement>("[data-property-add]")?.focus();
    }
    return true;
  };
  const selection = (menuState.selection ??= new PropertySelection(panel, {
    values: () => current()?.values ?? {},
    merge: (values) => {
      const focused = document.activeElement?.closest<HTMLElement>(
        "[data-property-row]",
      )?.dataset.propertyRow;
      apply({ type: "merge", values }, focused);
    },
    remove: (keys) => {
      const rows = [
        ...panel.querySelectorAll<HTMLElement>("[data-property-row]"),
      ];
      const first = rows.findIndex((row) =>
        keys.includes(row.dataset.propertyRow!),
      );
      const next =
        rows
          .slice(first)
          .find((row) => !keys.includes(row.dataset.propertyRow!)) ??
        rows
          .slice(0, first)
          .reverse()
          .find((row) => !keys.includes(row.dataset.propertyRow!));
      return apply({ type: "remove", keys }, next?.dataset.propertyRow);
    },
  }));
  selection.sync();
  const choices = (key: string): MenuItem[] =>
    key.toLowerCase() === "tags"
      ? [{ label: "Tags", disabled: true }]
      : [
          {
            label: `Automatic (${propertyKindLabels[inferPropertyKind(key, current()?.values?.[key])]})`,
            run: () => editor?.setType?.(key, null),
          },
          ...propertyKinds
            .filter((kind) => kind !== "tags")
            .map((kind) => ({
              label: propertyKindLabels[kind],
              run: () => editor?.setType?.(key, kind),
            })),
        ];
  panel.querySelectorAll<HTMLElement>("[data-property-row]").forEach((row) => {
    const key = row.dataset.propertyRow!;
    const convert = row.querySelector<HTMLButtonElement>(
      "[data-property-convert]",
    );
    if (convert && !boundWarnings.has(convert)) {
      boundWarnings.add(convert);
      convert.disabled = !editor?.setType;
      convert.addEventListener("click", () =>
        editor?.setType?.(
          key,
          inferPropertyKind(key, current()?.values?.[key], editor.types?.()),
        ),
      );
    }
    if (boundRows.has(row)) {
      return;
    }
    boundRows.add(row);
    const input = row.querySelector<HTMLInputElement>("[data-property-name]")!;
    const type = row.querySelector<HTMLButtonElement>("[data-property-type]")!;
    input.disabled = !editor?.edit;
    type.disabled = !editor?.setType;
    const rename = (): boolean => {
      const next = input.value.trim();
      if (next === key) {
        input.value = key;
        return true;
      }
      if (!validPropertyName(next)) {
        input.setCustomValidity("Enter a non-empty property name on one line.");
        input.reportValidity();
        return false;
      }
      const kind = editor?.types?.()[key.toLowerCase()];
      if (!apply({ type: "rename", key, name: next }, next)) {
        input.setCustomValidity(
          "This property name is already used, or the properties changed.",
        );
        input.reportValidity();
        return false;
      }
      if (kind && !Object.hasOwn(editor?.types?.() ?? {}, next.toLowerCase())) {
        editor?.setType?.(next, kind);
      }
      return true;
    };
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("blur", rename);
    input.addEventListener("property-commit", (event) => {
      if (!rename()) {
        event.preventDefault();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (rename()) {
          row.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        input.value = key;
        input.setCustomValidity("");
        row.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (rename()) {
          editor?.action?.("save");
        }
      }
    });
    const menu = (
      point: { x: number; y: number },
      typesOnly: boolean,
    ): void => {
      menuState.closeMenu?.();
      const keys = selection.keys(row);
      const multiple = !typesOnly && keys.length > 1;
      const items = typesOnly
        ? choices(key)
        : multiple
          ? []
          : [{ label: "Property type", children: choices(key) }];
      menuState.closeMenu = context.openMenu(
        panel,
        [
          ...items,
          {
            label: multiple ? "Copy properties" : "Copy property",
            run: () => {
              if (!selection.copy(multiple ? keys : [key])) {
                throw new Error(
                  "Could not copy properties. Try the keyboard copy shortcut.",
                );
              }
            },
          },
          {
            label: multiple ? "Remove properties" : "Remove property",
            run: () => selection.remove(multiple ? keys : [key]),
          },
        ],
        point,
        report,
        "Property actions",
      );
    };
    type.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = type.getBoundingClientRect();
      menu({ x: bounds.left, y: bounds.bottom }, true);
    });
    row.addEventListener("contextmenu", (event) => {
      if (!editor?.edit) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      menu({ x: event.clientX, y: event.clientY }, false);
    });
    row.addEventListener("keydown", (event) => {
      if (event.target !== row || event.isComposing) {
        return;
      }
      const vim =
        container.closest<HTMLElement>(".cm-editor")?.dataset.vimEnabled ===
        "true";
      const mod = event.metaKey || event.ctrlKey;
      const rows = [
        ...panel.querySelectorAll<HTMLElement>("[data-property-row]"),
      ];
      const index = rows.indexOf(row);
      let handled = true;
      if (event.altKey && event.key === "ArrowDown") {
        editor?.focusBody?.();
      } else if (
        event.key === "ArrowDown" ||
        (vim && event.key === "j") ||
        (event.key === "Tab" && !event.shiftKey)
      ) {
        (rows[index + 1] ?? add).focus();
      } else if (
        event.key === "ArrowUp" ||
        (vim && event.key === "k") ||
        (event.key === "Tab" && event.shiftKey)
      ) {
        (rows[index - 1] ?? heading).focus();
      } else if (event.key === "ArrowLeft" || (vim && event.key === "h")) {
        input.focus();
        input.select();
      } else if (
        event.key === "ArrowRight" ||
        event.key === "Enter" ||
        (vim && ["l", "i", "A"].includes(event.key))
      ) {
        focusValue(
          row,
          event.key === "A" ? "end" : event.key === "Enter" ? "all" : "start",
        );
      } else if (vim && event.key === "o") {
        add.click();
      } else if (mod && event.key === "Backspace") {
        apply(
          { type: "remove", keys: [key] },
          rows[index + 1]?.dataset.propertyRow ??
            rows[index - 1]?.dataset.propertyRow,
        );
      } else if (mod && event.key.toLowerCase() === "z") {
        editor?.action?.(event.shiftKey ? "redo" : "undo");
      } else if (mod && event.key.toLowerCase() === "s") {
        editor?.action?.("save");
      } else {
        handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });
  if (editor?.edit && !menuState.order) {
    const viewport = container.closest<HTMLElement>(".cm-scroller");
    if (viewport) {
      menuState.order = new PropertyOrder(panel, viewport, context.openMenu, {
        commit: (keys) => {
          const applied = editor.edit!(current()?.raw ?? "", {
            type: "order",
            keys,
          });
          if (!applied) {
            report(
              "This order could not be saved because it would invalidate the YAML. Keep anchors before their aliases.",
            );
          }
          return applied;
        },
        add: () => add.click(),
        clear: () =>
          selection.remove(
            [...panel.querySelectorAll<HTMLElement>("[data-property-row]")].map(
              (row) => row.dataset.propertyRow!,
            ),
          ),
        report,
      });
    }
  }
  menuState.order?.refresh(header.raw);
  if (existing) {
    return () => {};
  }
  bindPropertyForm(panel, editor, apply);
  return () => {
    menuState.closeMenu?.();
    menuState.order?.destroy();
    panels.delete(panel);
  };
}

function focusValue(
  row: HTMLElement,
  selection: "start" | "end" | "all" = "start",
): void {
  row.querySelector<HTMLButtonElement>("[data-property-edit]")?.click();
  const input = row.querySelector<HTMLInputElement>("dd input:not([hidden])");
  input?.focus();
  if (input && ["text", "search"].includes(input.type)) {
    input.setSelectionRange(
      selection === "end" ? input.value.length : 0,
      selection === "start" ? 0 : input.value.length,
    );
  }
}
