import { propertyTransaction } from "./edit-transaction";
import type { EditorView } from "@codemirror/view";
import {
  frontmatter,
  matchesPropertyKind,
  type PropertyEdit,
} from "../../markdown/properties";
import { editGroup } from "../document/api";
import type { PropertyContext, Action } from "./context";
import {
  inferPropertyKind,
  type PropertyKind,
  type PropertyTypes,
} from "../../markdown/properties/types";

import { confirmPropertyType } from "./type-dialog";

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
}

type PropertyEditor = NonNullable<PropertyContext["propertyEditor"]>;

/**
 * Structured editing of the note's YAML properties (Obsidian's "Properties").
 *
 * Every change is a source edit of the frontmatter, so it shares the note's
 * undo history. Type preferences (text, number, date, ...) are stored by the
 * host per vault; a type the user chooses for a value that does not match it
 * yet is "forced" until the value changes.
 */
export class PropertyEditing {
  private preferences: PropertyTypes = {};
  /** Property → chosen kind, valid while the value keeps the same JSON token. */
  private readonly forced = new Map<
    string,
    { kind: PropertyKind; value: string }
  >();
  private requestedType: { key: string; kind: PropertyKind | null } | undefined;
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
      set: (expected, key, value) =>
        this.edit(expected, { type: "set", key, value }),
      edit: (expected, operation) => this.edit(expected, operation),
      types: () => this.preferences,
      forcedTypes: () => this.forcedTypes(),
      setType: (key, kind) => {
        this.requestedType = { key, kind };
        this.forced.delete(key);
        this.options.setType(key, kind);
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
        ".hybrid-properties > div > .properties > dl > [data-property-row]",
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
    const emptyHeader = "---\n---\n";
    view.dispatch({
      ...(!header
        ? {
            changes: { from: 0, insert: emptyHeader + "\n" },
            annotations: editGroup.of(`property-${++this.sequence}`),
          }
        : {}),
      selection: { anchor: header?.end ?? emptyHeader.length },
    });
    queueMicrotask(() =>
      this.options
        .view()
        ?.dom.querySelector<HTMLButtonElement>("[data-property-add]")
        ?.click(),
    );
  }

  /** New type preferences from the host; continue a pending type change. */
  receiveTypes(message: { types: PropertyTypes }): void {
    for (const key of this.forced.keys()) {
      if (
        this.preferences[key.toLowerCase()] !== message.types[key.toLowerCase()]
      ) {
        this.forced.delete(key);
      }
    }
    this.preferences = message.types;
    this.options.refresh();
    const request = this.requestedType;
    if (
      request &&
      (request.kind === null ||
        message.types[request.key.toLowerCase()] === request.kind)
    ) {
      this.requestedType = undefined;
      if (request.kind) {
        void this.offerConversion(request.key, request.kind);
      }
    }
  }

  private forcedTypes(): PropertyTypes {
    const view = this.options.view();
    const values = view && frontmatter(view.state.doc.toString())?.values;
    for (const [key, entry] of this.forced) {
      if (token(values?.[key]) !== entry.value) {
        this.forced.delete(key);
      }
    }
    return Object.fromEntries(
      [...this.forced].map(([key, entry]) => [key, entry.kind]),
    );
  }

  /**
   * The user picked `kind` for a property whose value does not match it. Ask
   * before showing the value as that type; never rewrite the value silently.
   */
  private async offerConversion(
    key: string,
    kind: PropertyKind,
  ): Promise<void> {
    const owner = this.options.view();
    if (!owner) {
      return;
    }
    const header = frontmatter(owner.state.doc.toString());
    const value = header?.values?.[key];
    if (!header || matchesPropertyKind(kind, value)) {
      return;
    }
    if (isNestedPropertyValue(value)) {
      this.options.setStatus("Edit nested property values in source.");
      return;
    }
    const row = (): HTMLElement | null =>
      owner.dom.querySelector(`[data-property-row="${CSS.escape(key)}"]`);
    if (
      !(await confirmPropertyType(
        key,
        inferPropertyKind(key, value),
        kind,
        this.options.signal,
      ))
    ) {
      row()?.focus();
      return;
    }
    this.finishConversion({ owner, header: header.raw, key, kind, value, row });
  }

  private finishConversion(options: {
    owner: EditorView;
    header: string;
    key: string;
    kind: PropertyKind;
    value: unknown;
    row(): HTMLElement | null;
  }): void {
    const { owner, header, key, kind, value, row } = options;
    if (
      this.options.view() !== owner ||
      frontmatter(owner.state.doc.toString())?.raw !== header ||
      inferPropertyKind(key, value, this.preferences) !== kind
    ) {
      this.options.setStatus(
        "The properties changed. Choose the type again to update this value.",
      );
      return;
    }
    const valueToken = token(value);
    if (valueToken === undefined) {
      return;
    }
    this.forced.set(key, { kind, value: valueToken });
    this.options.refresh();
    row()?.querySelector<HTMLButtonElement>("[data-property-edit]")?.click();
    row()?.querySelector<HTMLInputElement>("dd input:not([hidden])")?.focus();
  }
}

function token(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
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
