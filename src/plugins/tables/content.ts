import type { EditorView } from "@codemirror/view";
import type { Logger } from "../../kernel";
import type { RenderPass, RenderService } from "../render/api";

/** Cancels stale cell renders before a cell editor takes ownership of its DOM. */
export class TableContent {
  private readonly passes = new Map<
    HTMLElement,
    { pass?: RenderPass; abort: AbortController }
  >();
  private live = true;
  constructor(
    private readonly view: EditorView,
    private readonly render: RenderService,
    private readonly logger: Logger,
  ) {}
  disposeContent(element: HTMLElement): void {
    const entry = this.passes.get(element);
    entry?.abort.abort();
    this.passes.delete(element);
    void entry?.pass?.dispose();
  }
  renderContent(element: HTMLElement, source: string, offset: number): void {
    this.disposeContent(element);
    const entry: { pass?: RenderPass; abort: AbortController } = {
      abort: new AbortController(),
    };
    this.passes.set(element, entry);
    void this.render
      .into(element, displayedCell(source), {
        signal: entry.abort.signal,
        sourceLine: this.view.state.doc.lineAt(offset).number - 1,
        measure: () => {
          if (this.live) {
            this.view.requestMeasure();
          }
        },
      })
      .then((pass) => {
        if (!this.live || this.passes.get(element) !== entry) {
          void pass.dispose();
        } else {
          entry.pass = pass;
        }
      })
      .catch((error) => this.logger.error("Table rendering failed", error));
  }

  dispose(): void {
    this.live = false;
    for (const element of this.passes.keys()) {
      this.disposeContent(element);
    }
  }
}

/**
 * GFM removes the backslash of an escaped pipe before parsing a cell, even
 * inside code spans, so `` `a \| b` `` shows `a | b`. The cell editor keeps
 * the escape; only the rendered cell drops it.
 */
export function displayedCell(source: string): string {
  return source.replace(/\\\|/g, "|");
}
