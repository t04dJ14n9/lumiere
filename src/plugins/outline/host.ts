import type { Plugin } from "../../kernel";
import { metadata } from "../../markdown/metadata";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { TreeNode, TreeSource } from "../../shared/runtime";
import type { EditorPanel } from "../editor/api";
import { protocol as editorProtocol } from "../editor/protocol";
import type {} from "../vault/api";
import { headingAt, outlineOf } from "./headings";
import type { OutlineHeading } from "./headings";

const OPEN_COMMAND = "markdownWorkbench.outline.open";
const REFRESH_DELAY_MS = 300;

/** The Note Outline view: the active editor's headings, following the caret. */
export const outlineHost: Plugin = {
  name: "outline",
  inject: { required: ["workbench", "vaults", "editors"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const source = new OutlineSource();
    const tree = views.tree("markdownWorkbench.outline", source);
    ctx.effect(() => () => tree.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const panel = ctx.editors.active();
      const text = panel ? await ctx.vaults.text(panel.document.uri) : "";
      source.set(panel?.document.uri, text);
      tree.setMessage(source.isEmpty ? "No headings." : undefined);
      tree.refresh();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    };
    ctx.effect(() => () => clearTimeout(timer));
    // A newly opened editor is already active, so VS Code reports no change
    // of active editor for it; refresh on open and close as well.
    ctx.on("editor/opened", schedule);
    ctx.on("editor/closed", schedule);
    ctx.on("editor/activeChanged", schedule);
    ctx.on("document/changed", schedule);
    ctx.on("editor/selectionChanged", (panel) => {
      if (tree.visible && panel === ctx.editors.active()) {
        void revealCaret(panel as EditorPanel, source, (node) =>
          tree.reveal(node),
        );
      }
    });
    ctx.effect(() =>
      views.command(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(String(uri), { offset: Number(offset) }),
      ),
    );
    void refresh();
  },
};

/** Select the heading of the section the caret is in. */
async function revealCaret(
  panel: EditorPanel,
  source: OutlineSource,
  reveal: (node: TreeNode) => void,
): Promise<void> {
  const caret = await panel.rpc.call(editorProtocol, "captureSelection", {});
  const heading = source.headingAtEditorOffset(caret.from);
  if (heading) {
    reveal(source.node(heading));
  }
}

class OutlineSource implements TreeSource {
  private uri?: string;
  private outline: OutlineHeading[] = [];
  private coordinates = new SourceCoordinates("");
  private readonly byId = new Map<string, OutlineHeading>();

  get isEmpty(): boolean {
    return this.outline.length === 0;
  }

  set(uri: string | undefined, text: string): void {
    if (uri === undefined) {
      delete this.uri;
    } else {
      this.uri = uri;
    }
    this.coordinates = new SourceCoordinates(text);
    this.outline = uri ? outlineOf(metadata(text).headings) : [];
    this.byId.clear();
    const index = (headings: OutlineHeading[]) => {
      for (const heading of headings) {
        this.byId.set(heading.id, heading);
        index(heading.children);
      }
    };
    index(this.outline);
  }

  headingAtEditorOffset(offset: number): OutlineHeading | undefined {
    return headingAt(this.outline, this.coordinates.toSource(offset));
  }

  roots(): TreeNode[] {
    return this.outline.map((heading) => this.node(heading));
  }

  children(node: TreeNode): TreeNode[] {
    const heading = this.byId.get(node.id);
    return heading ? heading.children.map((child) => this.node(child)) : [];
  }

  parent(node: TreeNode): TreeNode | undefined {
    const parent = this.byId.get(node.id)?.parent;
    return parent ? this.node(parent) : undefined;
  }

  node(heading: OutlineHeading): TreeNode {
    return {
      id: heading.id,
      label: heading.title,
      ...(heading.children.length > 0 && { expanded: true }),
      command: { id: OPEN_COMMAND, args: [this.uri, heading.offset] },
    };
  }
}
