import type { LivePreview } from "../livePreview/api";
import type { PropertyContext } from "./context";
import { PropertyWidget } from "./widget";

type Display = "visible" | "hidden" | "source";

/** Replaces only the renderer when display changes, retaining draft/editing state. */
export class PropertyPresentation {
  private removeRenderer?: () => void | Promise<void>;
  constructor(
    private readonly preview: LivePreview,
    private readonly context: PropertyContext,
    private display: Display,
  ) {}

  configure(display: Display): void {
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

  dispose(): void | Promise<void> {
    return this.removeRenderer?.();
  }
}
