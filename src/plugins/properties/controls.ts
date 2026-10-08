import { bindPropertyForm } from "./form";
import { PropertyOrder } from "./order";
import { PropertySelection } from "./selection";
import { frontmatter } from "../../markdown/properties";
import { inferPropertyKind } from "../../markdown/properties/types";
import type { PropertyContext } from "./context";
import {
  createControlEdits,
  type PropertyControlEdits,
  type PropertyEditor,
} from "./control-edits";
import { bindRowName } from "./row-name";
import { bindRowNavigation } from "./row-navigation";
import { bindRowMenu, type PropertyMenuState } from "./row-menu";

const boundRows = new WeakSet<HTMLElement>();
const boundWarnings = new WeakSet<HTMLButtonElement>();
interface PanelControls extends PropertyMenuState {
  selection?: PropertySelection;
  order?: PropertyOrder;
}
const panels = new WeakMap<HTMLElement, PanelControls>();

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
  const existing = panels.get(panel);
  const state = existing ?? {};
  panels.set(panel, state);
  state.closeMenu?.();
  const edits = createControlEdits({ container, panel, editor, source });
  const selection = (state.selection ??= createSelection(panel, edits));
  selection.sync();
  bindRows({
    container,
    panel,
    editor,
    edits,
    selection,
    state,
    openMenu: context.openMenu,
  });
  registerOrder({
    container,
    panel,
    editor,
    edits,
    selection,
    state,
    openMenu: context.openMenu,
  });
  state.order?.refresh(header.raw);
  if (existing) {
    return () => {};
  }
  bindPropertyForm(panel, editor, edits.apply);
  return () => {
    state.closeMenu?.();
    state.order?.destroy();
    panels.delete(panel);
  };
}

function createSelection(
  panel: HTMLElement,
  edits: PropertyControlEdits,
): PropertySelection {
  return new PropertySelection(panel, {
    values: () => edits.current()?.values ?? {},
    merge: (values) => {
      const focused = document.activeElement?.closest<HTMLElement>(
        "[data-property-row]",
      )?.dataset.propertyRow;
      edits.apply({ type: "merge", values }, focused);
    },
    remove: (keys) => {
      const rows = [
        ...panel.querySelectorAll<HTMLElement>("[data-property-row]"),
      ];
      const next = focusAfterRemoval(
        rows.map((row) => row.dataset.propertyRow!),
        keys,
      );
      return edits.apply({ type: "remove", keys }, next);
    },
  });
}

interface RowBindings {
  container: HTMLElement;
  panel: HTMLElement;
  editor: PropertyEditor;
  edits: PropertyControlEdits;
  selection: PropertySelection;
  state: PanelControls;
  openMenu: PropertyContext["openMenu"];
}

function bindRows(bindings: RowBindings): void {
  const { container, panel, editor, edits, selection, state, openMenu } =
    bindings;
  panel.querySelectorAll<HTMLElement>("[data-property-row]").forEach((row) => {
    const key = row.dataset.propertyRow!;
    bindTypeWarning(row, key, editor, edits.current);
    if (boundRows.has(row)) {
      return;
    }
    boundRows.add(row);
    bindRowName(row, key, editor, edits);
    bindRowMenu({ panel, row, key, editor, edits, selection, state, openMenu });
    bindRowNavigation({ row, container, panel, editor, apply: edits.apply });
  });
}

function bindTypeWarning(
  row: HTMLElement,
  key: string,
  editor: PropertyEditor,
  current: PropertyControlEdits["current"],
): void {
  const convert = row.querySelector<HTMLButtonElement>(
    "[data-property-convert]",
  );
  if (!convert || boundWarnings.has(convert)) {
    return;
  }
  boundWarnings.add(convert);
  convert.disabled = !editor?.setType;
  convert.addEventListener("click", () =>
    editor?.setType?.(
      key,
      inferPropertyKind(key, current()?.values?.[key], editor.types?.()),
    ),
  );
}

function registerOrder(bindings: RowBindings): void {
  const { container, panel, editor, edits, selection, state, openMenu } =
    bindings;
  if (!editor?.edit || state.order) {
    return;
  }
  const viewport = container.closest<HTMLElement>(".cm-scroller");
  if (!viewport) {
    return;
  }
  state.order = new PropertyOrder(panel, viewport, openMenu, {
    commit: (keys) => {
      const applied = editor.edit!(edits.current()?.raw ?? "", {
        type: "order",
        keys,
      });
      if (!applied) {
        edits.report(
          "This order could not be saved because it would invalidate the YAML. Keep anchors before their aliases.",
        );
      }
      return applied;
    },
    add: () =>
      panel.querySelector<HTMLButtonElement>("[data-property-add]")!.click(),
    clear: () =>
      selection.remove(
        [...panel.querySelectorAll<HTMLElement>("[data-property-row]")].map(
          (row) => row.dataset.propertyRow!,
        ),
      ),
    report: edits.report,
  });
}

export function focusAfterRemoval(
  rows: readonly string[],
  removed: readonly string[],
): string | undefined {
  const first = rows.findIndex((key) => removed.includes(key));
  return (
    rows.slice(first).find((key) => !removed.includes(key)) ??
    rows
      .slice(0, first)
      .reverse()
      .find((key) => !removed.includes(key))
  );
}
