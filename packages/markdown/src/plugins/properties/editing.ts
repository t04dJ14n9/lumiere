import { propertyTransaction } from "./edit-transaction";
import type { EditorView } from "@codemirror/view";
import { frontmatter, type PropertyEdit } from "../../markdown/properties";
import { editGroup } from "../document/api";
import type { PropertyContext, Action } from "./context";
import {
  type PropertyKind,
  type PropertyTypes,
} from "../../markdown/properties/types";

interface PropertyEditingOptions {
  view(): EditorView | undefined;
  setStatus(message: string): void;
  action(action: Action): void;
  refresh(): void;
  setType(key: string, kind: PropertyKind | null): void;
  show(): void;
  focusTitle(): void;
  pageHeading(backward: boolean): void;
  signal: AbortSignal;
  propertyNames?(): Promise<readonly string[]>;
  setCollapsed?(collapsed: boolean): void;
}

type PropertyEditor = NonNullable<PropertyContext["propertyEditor"]>;

/**
 * Structured editing of the note's YAML properties (Obsidian's "Properties").
 *
 * Every change is a source edit of the frontmatter, so it shares the note's
 * undo history. Type preferences (text, number, date, ...) are stored by the
 * host per vault and property name, independently of the note’s YAML value.
 */
export class PropertyEditing {
  private preferences: PropertyTypes = {};
  private collapsed = false;
  private sequence = 0;

  constructor(private readonly options: PropertyEditingOptions) {}

  /** The `propertyEditor` capabilities handed to the rendered property sheet. */
  editor(source: string): PropertyEditor {
    return {
      source,
      currentSource: () => this.options.view()?.state.doc.toString() ?? "",
      refresh: () => {
        const owner = this.options.view();
        queueMicrotask(() => {
          if (owner && this.options.view() === owner) {
            this.options.refresh();
          }
        });
      },
      set: (expected, key, value, yaml) =>
        this.edit(expected, { type: "set", key, value, yaml }),
      edit: (expected, operation) => this.edit(expected, operation),
      types: () => this.preferences,
      setType: (key, kind) => {
        this.options.setType(key, kind);
      },
      names: () => this.options.propertyNames?.() ?? Promise.resolve([]),
      collapsed: () => this.collapsed,
      setCollapsed: (collapsed) => {
        this.receiveCollapsed(collapsed);
        this.options.setCollapsed?.(collapsed);
      },
      action: this.options.action,
      focusTitle: () => {
        const view = this.options.view();
        if (view) {
          this.options.focusTitle();
        }
      },
      pageHeading: (backward) => this.options.pageHeading(backward),
      focusBody: () => {
        const view = this.options.view();
        if (view) {
          view.dispatch({
            selection: {
              anchor: frontmatter(view.state.doc.toString())?.end ?? 0,
            },
            scrollIntoView: true,
          });
          view.focus();
        }
      },
    };
  }

  /**
   * Apply `operation` if the frontmatter still reads `expected`. A display-only
   * sort is persisted together with the edit as one undoable change.
   */
  edit(expected: string, operation: PropertyEdit): boolean {
    const view = this.options.view();
    if (!view) {
      return false;
    }
    const displayed = [
      ...view.dom.querySelectorAll<HTMLElement>(
        ".hybrid-properties .metadata-properties > [data-property-row]",
      ),
    ].map((row) => row.dataset.propertyRow!);
    const changeSet = propertyTransaction({
      document: view.state.doc,
      expected,
      operation,
      displayed,
    });
    if (!changeSet) {
      return false;
    }
    if (!changeSet.empty) {
      view.dispatch({
        changes: changeSet,
        annotations: editGroup.of(`property-${++this.sequence}`),
      });
    }
    return true;
  }

  /**
   * Obsidian's "Add alias": an empty `aliases` property, unless there is one,
   * then the caret in it, ready for a name.
   */
  addAlias(): void {
    const view = this.options.view();
    if (!view || document.querySelector("dialog[open]")) {
      return;
    }
    const header = frontmatter(view.state.doc.toString());
    if (header?.error) {
      this.options.setStatus(
        "Fix the properties source before adding an alias.",
      );
      return;
    }
    this.options.show();
    if (!header?.values || !("aliases" in header.values)) {
      this.edit(header?.raw ?? "", { type: "add", key: "aliases" });
    }
    focusWhenShown(
      view.dom,
      '[data-property-list="aliases"] [data-property-list-input]',
    );
  }

  /** Obsidian's "Clear file properties": the whole properties block goes. */
  clear(): boolean {
    const view = this.options.view();
    const header = view && frontmatter(view.state.doc.toString());
    if (!view || !header) {
      return false;
    }
    view.dispatch({
      changes: { from: 0, to: header.end },
      annotations: editGroup.of(`property-${++this.sequence}`),
    });
    return true;
  }

  /** Obsidian's "Add file property": create the sheet if needed and start a new row. */
  add(): void {
    const view = this.options.view();
    if (!view || document.querySelector("dialog[open]")) {
      return;
    }
    const source = view.state.doc.toString();
    const header = frontmatter(source);
    if (header?.error || (!header && /^---(?:\r?\n|$)/.test(source))) {
      this.options.setStatus(
        "Fix the properties source before adding a field.",
      );
      return;
    }
    this.options.show();
    view.dispatch({
      selection: { anchor: header?.end ?? 0 },
    });
    queueMicrotask(() =>
      this.options
        .view()
        ?.dom.querySelector<HTMLButtonElement>("[data-property-add]")
        ?.click(),
    );
  }

  /** Registry updates only change presentation; values and undo remain untouched. */
  receiveTypes(message: { types: PropertyTypes }): void {
    this.preferences = message.types;
    this.options.refresh();
  }

  receiveCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.options.refresh();
  }
}

export function isNestedPropertyValue(value: unknown): boolean {
  const scalarList =
    Array.isArray(value) &&
    value.every(
      (item) =>
        item === null || ["string", "number", "boolean"].includes(typeof item),
    );
  return typeof value === "object" && value !== null && !scalarList;
}

/**
 * Focus the element `selector` names once the property sheet has rendered
 * it, which can take a few frames after an edit.
 */
function focusWhenShown(
  root: HTMLElement,
  selector: string,
  frames = 30,
): void {
  const target = root.querySelector<HTMLElement>(selector);
  if (target) {
    target.focus();
  } else if (frames > 0) {
    requestAnimationFrame(() => focusWhenShown(root, selector, frames - 1));
  }
}
