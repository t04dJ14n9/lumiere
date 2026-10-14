import type { Logger } from "../../kernel";
import type { TreeHandle } from "../../shared/runtime";
import type { EditorPanel, Editors } from "../editor/api";
import { protocol as editorProtocol } from "../editor/protocol";
import type { OutlineSource } from "./tree";

const REFRESH_DELAY_MS = 300;

interface OutlineViewOptions {
  tree: TreeHandle;
  source: OutlineSource;
  editors: Pick<Editors, "active">;
  followsCursor(): boolean;
  logger: Logger;
}

/** Owns refresh timing and rejects caret captures from an obsolete panel or text. */
export class OutlineView {
  private panel: EditorPanel | undefined;
  private sourceVersion = 0;
  private revision = 0;
  private followRequest = 0;
  private isDisposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: OutlineViewOptions) {}

  schedule(): void {
    this.followRequest++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), REFRESH_DELAY_MS);
  }

  refresh(): void {
    if (this.isDisposed) {
      return;
    }
    clearTimeout(this.timer);
    this.revision++;
    this.followRequest++;
    this.panel = this.options.editors.active();
    const document = this.panel?.document;
    this.sourceVersion = document?.version ?? 0;
    this.options.source.set(document?.uri, document?.getText() ?? "");
    this.options.tree.setMessage(
      this.options.source.isEmpty ? "No headings." : undefined,
    );
    this.options.tree.refresh();
    void this.followCaret();
  }

  /** Detached event work has its own error sink, including closed-panel RPC failures. */
  async followCaret(): Promise<void> {
    const request = ++this.followRequest;
    const panel = this.panel;
    if (!panel || !this.canFollow(panel, request)) {
      return;
    }
    try {
      await panel.ready;
      if (!this.canFollow(panel, request)) {
        return;
      }
      const caret = await panel.rpc.call(editorProtocol, "captureCursor", {});
      if (
        !this.canFollow(panel, request) ||
        caret.version !== panel.session.version
      ) {
        return;
      }
      const node = this.options.source.activeNode(caret.head);
      if (node) {
        await this.options.tree.reveal(node, { select: true, focus: false });
      }
    } catch (error) {
      if (this.canFollow(panel, request)) {
        this.options.logger.warn("Outline cursor follow failed", error);
      }
    }
  }

  private canFollow(panel: EditorPanel, request: number): boolean {
    return (
      !this.isDisposed &&
      request === this.followRequest &&
      this.options.followsCursor() &&
      this.options.tree.visible &&
      panel === this.panel &&
      panel === this.options.editors.active() &&
      panel.document.version === this.sourceVersion
    );
  }

  async expandAll(): Promise<void> {
    const revision = this.revision;
    // Native reveal expands at most three levels. Visiting every node also
    // expands deep Markdown outlines while preserving selection and focus.
    for (const node of this.options.source.allNodes()) {
      if (
        this.isDisposed ||
        revision !== this.revision ||
        !this.options.tree.visible
      ) {
        return;
      }
      await this.options.tree.reveal(node, {
        expand: true,
        select: false,
        focus: false,
      });
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.followRequest++;
    clearTimeout(this.timer);
  }
}
