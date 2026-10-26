import { WidgetType, type EditorView } from "@codemirror/view";
import type { RenderBlock } from "../livePreview/api";
import { TableController } from "./controller";
import type { TableEnvironment } from "./environment";
import { rememberTableHeight, tableEstimatedHeight } from "./estimated-height";
import { entersTable } from "./navigation";

export {
  activeEditor,
  clearTableSelection,
  tableActions,
  tableSelection,
  tableSelectionChanges,
} from "./state";

const controllers = new WeakMap<HTMLElement, TableController>();
const tableObservers = new WeakMap<HTMLElement, ResizeObserver>();

function watchTableRoot(root: HTMLElement, source: string): void {
  if (!source || typeof ResizeObserver === "undefined") {
    return;
  }
  tableObservers.get(root)?.disconnect();
  const observer = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height ?? 0;
    if (height > 0) {
      rememberTableHeight(source, height);
    }
  });
  observer.observe(root);
  tableObservers.set(root, observer);
}

/** The observer has the last height; reading it here forced a layout per unmount. */
function unwatchTableRoot(root: HTMLElement): void {
  tableObservers.get(root)?.disconnect();
  tableObservers.delete(root);
}

interface RetainedTable {
  readonly root: HTMLElement;
  readonly controller: TableController;
  source: string;
  revision: number;
  mounted: boolean;
}

const MAX_RETAINED_TABLES = 64;
const retainedPools = new WeakMap<TableEnvironment, Set<RetainedTable>>();
const retainedByRoot = new WeakMap<HTMLElement, RetainedTable>();

/** Retain table DOM and controllers across viewport scroll exit/re-entry while the plugin is active. */
export function enableTableRetention(
  environment: TableEnvironment,
): () => void {
  const pool = new Set<RetainedTable>();
  retainedPools.set(environment, pool);
  return () => {
    retainedPools.delete(environment);
    for (const entry of pool) {
      retainedByRoot.delete(entry.root);
      unwatchTableRoot(entry.root);
      entry.controller.destroy();
      controllers.delete(entry.root);
    }
    pool.clear();
  };
}

/** Evict unmounted retained tables when render/changed invalidates rendered output. */
export function evictDisconnectedTables(environment: TableEnvironment): void {
  const pool = retainedPools.get(environment);
  if (!pool) {
    return;
  }
  for (const entry of [...pool]) {
    if (!entry.mounted) {
      pool.delete(entry);
      retainedByRoot.delete(entry.root);
      entry.controller.destroy();
      controllers.delete(entry.root);
    }
  }
}

function takeRetainedTable(
  environment: TableEnvironment,
  source: string,
): RetainedTable | undefined {
  const pool = retainedPools.get(environment);
  if (!pool) {
    return undefined;
  }
  for (const entry of pool) {
    if (!entry.mounted && entry.source === source) {
      pool.delete(entry);
      pool.add(entry);
      return entry;
    }
  }
  return undefined;
}

/** Widget DOM identifies the table in this panel, even after source positions shift. */
export function enterTable(view: EditorView, direction: -1 | 1): boolean {
  if (view.composing) {
    return false;
  }
  for (const root of view.dom.querySelectorAll<HTMLElement>(".hybrid-table")) {
    const controller = controllers.get(root);
    if (controller && entersTable(view.state, controller.bounds(), direction)) {
      controller.enter(direction);
      return true;
    }
  }
  return false;
}

export function enterTableAtSourcePosition(
  view: EditorView,
  head: number,
): boolean {
  for (const root of view.dom.querySelectorAll<HTMLElement>(".hybrid-table")) {
    const controller = controllers.get(root);
    if (controller && controller.enterSourcePosition(head)) {
      return true;
    }
  }
  return false;
}

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
    const retained = takeRetainedTable(this.environment, this.block.source);
    if (retained) {
      retained.mounted = true;
      const force = retained.revision !== this.revision;
      retained.source = this.block.source;
      retained.revision = this.revision;
      retained.controller.update(this.block, view, force);
      watchTableRoot(retained.root, this.block.source);
      return retained.root;
    }
    const root = document.createElement("section");
    root.className = "hybrid-block hybrid-table cm-table-widget";
    root.tabIndex = 0;
    const controller = new TableController(
      root,
      view,
      this.block,
      this.environment,
    );
    controllers.set(root, controller);
    const pool = retainedPools.get(this.environment);
    if (pool) {
      const entry: RetainedTable = {
        root,
        controller,
        source: this.block.source,
        revision: this.revision,
        mounted: true,
      };
      retainedByRoot.set(root, entry);
      pool.add(entry);
    }
    watchTableRoot(root, this.block.source);
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
    controller.update(this.block, view, this.revision !== previous.revision);
    const retained = retainedByRoot.get(root);
    if (retained) {
      retained.source = this.block.source;
      retained.revision = this.revision;
    }
    if (this.block.source !== previous.block.source) {
      watchTableRoot(root, this.block.source);
    }
    return true;
  }
  override ignoreEvent(): boolean {
    return true;
  }
  override destroy(root: HTMLElement): void {
    unwatchTableRoot(root);
    const retained = retainedByRoot.get(root);
    const pool = retainedPools.get(this.environment);
    if (retained && pool && pool.has(retained)) {
      retained.mounted = false;
      retained.controller.suspend();
      pool.delete(retained);
      pool.add(retained);
      let unmountedCount = 0;
      for (const item of pool) {
        if (!item.mounted) {
          unmountedCount++;
        }
      }
      if (unmountedCount > MAX_RETAINED_TABLES) {
        for (const item of pool) {
          if (!item.mounted) {
            pool.delete(item);
            retainedByRoot.delete(item.root);
            item.controller.destroy();
            controllers.delete(item.root);
            break;
          }
        }
      }
      return;
    }
    controllers.get(root)?.destroy();
    controllers.delete(root);
  }
  override get estimatedHeight(): number {
    return tableEstimatedHeight(this.block.source);
  }
}
