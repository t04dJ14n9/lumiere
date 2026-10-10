import { bindPropertyForm } from "./form";
import { PropertyOrder } from "./order";
import { PropertySelection } from "./selection";
import { frontmatter } from "../../markdown/properties";
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
interface PanelControls extends PropertyMenuState {
  source?: string;
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
  if (!panel || header?.error) {
    return () => {};
  }
  const editor =
    context.propertyEditor?.source === context.source
      ? context.propertyEditor
      : undefined;
  const existing = panels.get(panel);
  const state = existing ?? {};
  panels.set(panel, state);
  // A refresh that changes nothing (a blur committing an empty input) must
  // not close the menu the click that caused the blur just opened.
  if (state.source !== source) {
    state.closeMenu?.();
  }
  state.source = source;
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
    readClipboard: context.readClipboard,
  });
  registerOrder({
    container,
    panel,
    editor,
    edits,
    selection,
    state,
    openMenu: context.openMenu,
    readClipboard: context.readClipboard,
  });
  state.order?.refresh(header?.raw ?? "");
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
  readClipboard: PropertyContext["readClipboard"];
}

function bindRows(bindings: RowBindings): void {
  const {
    container,
    panel,
    editor,
    edits,
    selection,
    state,
    openMenu,
    readClipboard,
  } = bindings;
  panel.querySelectorAll<HTMLElement>("[data-property-row]").forEach((row) => {
    const key = row.dataset.propertyRow!;
    if (boundRows.has(row)) {
      return;
    }
    boundRows.add(row);
    bindRowName(row, key, editor, edits);
    bindRowMenu({
      panel,
      row,
      key,
      editor,
      edits,
      selection,
      state,
      openMenu,
      readClipboard,
    });
    bindRowNavigation({ row, container, panel, editor, apply: edits.apply });
  });
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
