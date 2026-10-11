import type { EditorView } from "@codemirror/view";
import { captureNavigation, runNavigation } from "./navigation";

export function findNavigationStep(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "altKey" | "metaKey" | "ctrlKey"
  >,
): "next" | "previous" | undefined {
  const next = event.key === "F3" && !event.metaKey && !event.ctrlKey;
  const modG =
    event.key.toLowerCase() === "g" && (event.metaKey || event.ctrlKey);
  if (!event.altKey && (next || modG)) {
    return event.shiftKey ? "previous" : "next";
  }
  return undefined;
}

/** A query can move the selection many times before its first explicit jump. */
export class FindNavigation {
  private finish: (() => void) | undefined;
  running = false;

  constructor(private readonly view: EditorView) {}

  preview(run: () => void): void {
    this.finish ??= captureNavigation(this.view);
    this.running = true;
    try {
      run();
    } finally {
      this.running = false;
    }
  }

  accept(run: () => boolean): boolean {
    const finish = this.finish;
    this.finish = undefined;
    if (!finish) {
      return runNavigation(this.view, run);
    }
    this.running = true;
    try {
      const result = run();
      if (result) {
        finish();
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  cancel(): void {
    this.finish = undefined;
  }
}
