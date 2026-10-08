import type { EditorView } from "@codemirror/view";
import type { Disposer, Schema } from "../../kernel";

export interface ViewStateContribution<T> {
  schema: Schema<T>;
  capture(view: EditorView): T;
  restore(view: EditorView, value: T, source: string): void;
}
export interface ViewStateContributions {
  contribute<T>(key: string, contribution: ViewStateContribution<T>): Disposer;
}

/** Unknown keys survive a round trip and can be consumed by a late plugin. */
export class ViewContributions implements ViewStateContributions {
  private values: Record<string, unknown> = {};
  private source = "";
  private legacy: Record<string, unknown> = {};
  private readonly active = new Map<
    string,
    {
      capture(): unknown;
      restore(value: unknown): void;
    }
  >();
  constructor(private readonly view: EditorView) {}
  restore(
    values: Record<string, unknown>,
    source: string,
    legacy: Record<string, unknown> = {},
  ): void {
    this.values = { ...values };
    this.source = source;
    this.legacy = legacy;
    for (const [key, contribution] of this.active) {
      if (Object.hasOwn(this.values, key) || Object.hasOwn(this.legacy, key))
        contribution.restore(
          Object.hasOwn(this.values, key) ? this.values[key] : this.legacy[key],
        );
    }
  }
  capture(): Record<string, unknown> {
    const values = { ...this.legacy, ...this.values };
    for (const [key, contribution] of this.active)
      values[key] = contribution.capture();
    return values;
  }
  contribute<T>(key: string, contribution: ViewStateContribution<T>): Disposer {
    if (this.active.has(key))
      throw new Error(`Duplicate view-state contribution: ${key}`);
    const entry = {
      capture: () => contribution.schema.parse(contribution.capture(this.view)),
      restore: (value: unknown) => {
        let parsed: T;
        try {
          parsed = contribution.schema.parse(value);
        } catch {
          return;
        }
        contribution.restore(this.view, parsed, this.source);
      },
    };
    this.active.set(key, entry);
    if (Object.hasOwn(this.values, key) || Object.hasOwn(this.legacy, key))
      entry.restore(
        Object.hasOwn(this.values, key) ? this.values[key] : this.legacy[key],
      );
    return () => {
      if (this.active.get(key) !== entry) return;
      this.values[key] = entry.capture();
      this.active.delete(key);
    };
  }
}
