import { ChangeSet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  frontmatter,
  matchesPropertyKind,
  propertyChanges,
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

  constructor(
    private readonly view: () => EditorView | undefined,
    private readonly setStatus: (message: string) => void,
    private readonly action: (action: Action) => void,
    private readonly refresh: () => void,
    private readonly setType: (key: string, kind: PropertyKind | null) => void,
    private readonly show: () => void,
    private readonly focusTitle: () => void,
    private readonly pageHeading: (backward: boolean) => void,
    private readonly signal: AbortSignal,
  ) {}

  /** The `propertyEditor` capabilities handed to the rendered property sheet. */
  editor(source: string): PropertyEditor {
    return {
      source,
      currentSource: () => this.view()?.state.doc.toString() ?? "",
      refresh: () => {
        const owner = this.view();
        queueMicrotask(() => {
          if (owner && this.view() === owner) {
            this.refresh();
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
        this.setType(key, kind);
      },
      action: this.action,
      focusTitle: () => {
        const view = this.view();
        if (view) {
          this.focusTitle();
        }
      },
      pageHeading: (backward) => this.pageHeading(backward),
      focusBody: () => {
        const view = this.view();
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
    const view = this.view();
    if (!view) {
      return false;
    }
    const source = view.state.doc.toString();
    const current = frontmatter(source)?.raw ?? "";
    if (current.replace(/\r?\n$/, "") !== expected.replace(/\r?\n$/, "")) {
      return false;
    }
    const changes = propertyChanges(source, operation);
    if (!changes) {
      return false;
    }
    let changeSet = ChangeSet.of(
      changes.filter(
        (change) => source.slice(change.from, change.to) !== change.insert,
      ),
      source.length,
    );
    const displayed = [
      ...view.dom.querySelectorAll<HTMLElement>(
        ".hybrid-properties > div > .properties > dl > [data-property-row]",
      ),
    ].map((row) => row.dataset.propertyRow!);
    const stored = Object.keys(frontmatter(source)?.values ?? {});
    if (
      operation.type !== "order" &&
      displayed.length === stored.length &&
      displayed.some((key, index) => key !== stored[index])
    ) {
      const next = changeSet.apply(view.state.doc);
      const remaining = new Set(
        Object.keys(frontmatter(next.toString())?.values ?? {}),
      );
      const order: string[] = [];
      for (const key of displayed) {
        const name =
          operation.type === "rename" && key === operation.key
            ? operation.name
            : key;
        if (remaining.delete(name)) {
          order.push(name);
        }
      }
      order.push(...remaining);
      const reorder = propertyChanges(next.toString(), {
        type: "order",
        keys: order,
      });
      if (!reorder) {
        return false;
      }
      changeSet = changeSet.compose(ChangeSet.of(reorder, next.length));
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
    const view = this.view();
    if (!view || document.querySelector("dialog[open]")) {
      return;
    }
    const source = view.state.doc.toString();
    const header = frontmatter(source);
    if (header?.error || (!header && /^---(?:\r?\n|$)/.test(source))) {
      this.setStatus("Fix the properties source before adding a field.");
      return;
    }
    this.show();
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
      this.view()
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
    this.refresh();
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
    const view = this.view();
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
    const owner = this.view();
    if (!owner) {
      return;
    }
    const header = frontmatter(owner.state.doc.toString());
    const value = header?.values?.[key];
    if (!header || matchesPropertyKind(kind, value)) {
      return;
    }
    const scalarList =
      Array.isArray(value) &&
      value.every(
        (item) =>
          item === null ||
          ["string", "number", "boolean"].includes(typeof item),
      );
    if (typeof value === "object" && value !== null && !scalarList) {
      this.setStatus("Edit nested property values in source.");
      return;
    }
    const row = (): HTMLElement | null =>
      owner.dom.querySelector(`[data-property-row="${CSS.escape(key)}"]`);
    if (
      !(await confirmPropertyType(
        key,
        inferPropertyKind(key, value),
        kind,
        this.signal,
      ))
    ) {
      row()?.focus();
      return;
    }
    if (
      this.view() !== owner ||
      frontmatter(owner.state.doc.toString())?.raw !== header.raw ||
      inferPropertyKind(key, value, this.preferences) !== kind
    ) {
      this.setStatus(
        "The properties changed. Choose the type again to update this value.",
      );
      return;
    }
    const valueToken = token(value);
    if (valueToken === undefined) {
      return;
    }
    this.forced.set(key, { kind, value: valueToken });
    this.refresh();
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
