import type { LivePreview } from "../livePreview/api";
import type { PropertyContext } from "./context";
import { PropertyWidget } from "./widget";
import type { EditorView } from "@codemirror/view";
import { frontmatter } from "../../markdown/properties";
import { reconcileProperties } from "./sheet";

type Display = "visible" | "hidden" | "source";

/** Replaces only the renderer when display changes, retaining draft/editing state. */
export class PropertyPresentation {
  private removeRenderer?: () => void | Promise<void>;
  private emptySheet?: {
    view: EditorView;
    widget: PropertyWidget;
    dom: HTMLElement;
  };
  constructor(
    private readonly preview: LivePreview,
    private readonly context: PropertyContext,
    private display: Display,
  ) {}

  /** The properties block is a widget (not source text, not hidden). */
  get isWidget(): boolean {
    return this.display === "visible";
  }

  configure(display: Display): void {
    // Replacing an unchanged renderer would discard unnamed draft rows.
    if (display === this.display && this.removeRenderer) {
      return;
    }
    this.display = display;
    this.install();
  }

  install(): void {
    void this.removeRenderer?.();
    this.removeRenderer = this.preview.block({
      kind: "properties",
      editing: this.display === "hidden" ? "reveal" : "widget",
      match: (node) => this.display !== "source" && node.name === "Frontmatter",
      widget: (block) =>
        new PropertyWidget(
          block.source,
          this.context,
          this.display === "hidden",
        ),
    });
  }

  /** A draft sheet for a note with no YAML must not create an undo step yet. */
  show(view: EditorView): void {
    this.configure("visible");
    if (frontmatter(view.state.doc.toString()) || this.emptySheet) {
      return;
    }
    const widget = new PropertyWidget(
      view.state.doc.toString(),
      this.context,
      false,
      true,
    );
    const dom = widget.toDOM(view);
    dom.classList.add("property-pending-sheet");
    view.scrollDOM.before(dom);
    this.emptySheet = { view, widget, dom };
  }

  reconcileEmpty(): void {
    const empty = this.emptySheet;
    if (!empty) {
      return;
    }
    const source = empty.view.state.doc.toString();
    if (frontmatter(source)) {
      this.removeEmptySheet();
    } else if (empty.dom.firstElementChild) {
      reconcileProperties(
        empty.dom.firstElementChild as HTMLElement,
        source,
        this.context,
      );
    }
  }

  private removeEmptySheet(): void {
    const empty = this.emptySheet;
    if (empty) {
      delete this.emptySheet;
      empty.widget.destroy(empty.dom);
      empty.dom.remove();
    }
  }

  dispose(): void | Promise<void> {
    this.removeEmptySheet();
    return this.removeRenderer?.();
  }
}
