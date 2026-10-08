import { Schema } from "../../kernel";
import type { EditorView } from "@codemirror/view";

/** Per-plugin disclosure memory; live bindings also support explicit view transfer. */
export class DisclosureState {
  readonly schema = Schema.record(Schema.boolean());
  private values = new Map<string, boolean>();
  private bindings = new Set<{
    key: string;
    details: { open: boolean };
    initial: boolean;
    measure(): void;
  }>();
  constructor(private readonly source: string) {}
  capture() {
    return Object.fromEntries(this.values);
  }
  restore(_view: EditorView, values: Record<string, boolean>, source: string) {
    this.values.clear();
    for (const [key, open] of Object.entries(values)) {
      const local =
        source &&
        (key.startsWith(source + "|") || key.startsWith(source + "/"));
      this.values.set(
        local ? this.source + key.slice(source.length) : key,
        open,
      );
    }
    for (const binding of this.bindings) {
      binding.details.open = this.values.get(binding.key) ?? binding.initial;
      binding.measure();
    }
  }
  bind(key: string, details: { open: boolean }, measure: () => void) {
    const binding = { key, details, initial: details.open, measure };
    this.bindings.add(binding);
    details.open = this.values.get(key) ?? details.open;
    return {
      remember: () => {
        this.values.set(key, details.open);
      },
      dispose: () => {
        this.bindings.delete(binding);
      },
    };
  }
}
