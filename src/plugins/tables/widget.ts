import { WidgetType, type EditorView } from "@codemirror/view";
import type { RenderBlock } from "../livePreview/api";
import { TableController } from "./controller";
import type { TableEnvironment } from "./environment";

export {
  activeEditor,
  clearTableSelection,
  revealTableSource,
  tableActions,
  tableSelection,
  tableSelectionChanges,
  tableSource,
} from "./state";

const controllers = new WeakMap<HTMLElement, TableController>();

export class TableWidget extends WidgetType {
  constructor(
    readonly block: RenderBlock,
    readonly revision: number,
    readonly environment: TableEnvironment,
  ) {
    super();
  }
  override eq(other: TableWidget): boolean {
    return (
      this.block.source === other.block.source &&
      this.revision === other.revision
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("section");
    root.className = "hybrid-block hybrid-table";
    root.tabIndex = 0;
    const controller = new TableController(
      root,
      view,
      this.block,
      this.environment,
    );
    controllers.set(root, controller);
    return root;
  }
  override updateDOM(
    root: HTMLElement,
    view: EditorView,
    previous: this,
  ): boolean {
    if (this.environment !== previous.environment) {
      return false;
    }
    const controller = controllers.get(root);
    if (!controller) {
      return false;
    }
    controller.update(this.block, view);
    return true;
  }
  override ignoreEvent(): boolean {
    return true;
  }
  override destroy(root: HTMLElement): void {
    controllers.get(root)?.destroy();
    controllers.delete(root);
  }
}
