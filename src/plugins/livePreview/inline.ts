import type { Range, EditorState } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import type {
  EditorView,
  DecorationSet,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { linkDestination } from "../../markdown/html";
import { documentTree } from "./document-tree";
import { inlineRenderers, revealed } from "./registry";
import { decorateListItem } from "./lists";
import { decorateInlineHtml } from "./inline-html";
import { decorateBlockId } from "./block-id";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";
const inlineClasses: Readonly<Record<string, string>> = {
  Highlight: "md-highlight",
  StrongEmphasis: "md-strong",
  Emphasis: "md-emphasis",
  Strikethrough: "md-strike",
  InlineCode: "md-inline-code",
};

/** The number of quotes around a node, counting the node itself. */
export function quoteDepth(node: SyntaxNode | null): number {
  let depth = 0;
  for (let current = node; current; current = current.parent) {
    if (current.name === "Blockquote") {
      depth++;
    }
  }
  return depth;
}

export function inlineDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
): DecorationSet {
  const builder = new InlineDecorations(state);
  for (const visible of visibleRanges) {
    state.field(documentTree).iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => builder.decorate(node, visible),
    });
  }
  return Decoration.set(builder.ranges, true);
}

class InlineDecorations implements InlineContext {
  readonly ranges: Range<Decoration>[] = [];
  private readonly lines = new Set<string>();
  constructor(readonly state: EditorState) {}

  revealed = (from: number, to: number): boolean =>
    revealed(this.state, from, to);
  mark = (
    from: number,
    to: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void => {
    if (from < to) {
      this.ranges.push(
        Decoration.mark({ class: cls, attributes }).range(from, to),
      );
    }
  };
  hide = (from: number, to: number): void => {
    if (from < to) {
      this.ranges.push(Decoration.replace({}).range(from, to));
    }
  };
  replace = (from: number, to: number, widget: WidgetType): void => {
    this.ranges.push(Decoration.replace({ widget }).range(from, to));
  };
  line = (
    at: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void => {
    const from = this.state.doc.lineAt(at).from;
    if (this.lines.has(`${from}:${cls}`)) {
      return;
    }
    this.lines.add(`${from}:${cls}`);
    this.ranges.push(Decoration.line({ class: cls, attributes }).range(from));
  };

  decorate(
    node: SyntaxNodeRef,
    visible: { from: number; to: number },
  ): false | undefined {
    const { name, from, to } = node;
    const custom = this.state
      .facet(inlineRenderers)
      .find((renderer) => renderer.nodes.includes(name));
    if (custom) {
      custom.decorate(node, this);
      return false;
    }
    const cls = inlineClasses[name];
    if (cls) {
      this.mark(from, to, cls);
    }
    if (name === "ObsidianComment") {
      this.mark(from, to, "md-comment");
      return false;
    }
    if (name === "Escape" && !this.revealed(from, to)) {
      this.hide(from, from + 1);
    }
    decorateListItem(node, this);
    decorateInlineHtml(node, this);
    decorateBlockId(node, this);
    if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
      this.line(from, `md-heading md-h${name.at(-1)}`);
    }
    this.decorateBlockLines(node, visible);
    this.decorateLink(node);
    this.decorateBareUrl(node);
    this.hideSyntax(node);
    return undefined;
  }

  private decorateBlockLines(
    node: SyntaxNodeRef,
    visible: { from: number; to: number },
  ): void {
    const classes: Readonly<Record<string, string>> = {
      Blockquote: "md-quote",
      FencedCode: "md-code-line",
      Table: "md-table-source",
    };
    const cls = classes[node.name];
    // A nested quote's lines are decorated with the outermost quote.
    if (!cls || (node.name === "Blockquote" && quoteDepth(node.node) > 1)) {
      return;
    }
    for (
      let pos = Math.max(node.from, visible.from);
      pos <= Math.min(node.to, visible.to);

    ) {
      const current = this.state.doc.lineAt(pos);
      this.line(pos, cls, this.lineAttributes(node.name, current.to));
      pos = current.to + 1;
    }
  }

  /** Each quote level draws its own bar, as in Obsidian. */
  private lineAttributes(
    name: string,
    lineEnd: number,
  ): Record<string, string> | undefined {
    if (name !== "Blockquote") {
      return undefined;
    }
    const inner = this.state.field(documentTree).resolveInner(lineEnd, -1);
    return { style: `--quote-depth: ${Math.max(1, quoteDepth(inner))}` };
  }

  private decorateLink(node: SyntaxNodeRef): void {
    if (node.name !== "Link") {
      return;
    }
    const { from, to } = node;
    const url = node.node.getChild("URL");
    if (!url) {
      return;
    }
    const closingLabel = node.node.getChildren("LinkMark")[1];
    const isRendered = !this.revealed(from, to);
    const href = linkDestination(this.state.sliceDoc(url.from, url.to));
    // Rendered labels open on plain click; source needs Cmd/Ctrl-click.
    this.mark(from + 1, closingLabel?.from ?? to, linkClass(isRendered, href), {
      "data-href": href,
    });
    if (isRendered) {
      if (closingLabel) {
        this.hide(closingLabel.from, to);
      }
      this.hide(from, from + 1);
    }
  }

  /** URLs written as text (`https://…`, `www.…`, `<…>`) are links, as in Obsidian. */
  private decorateBareUrl(node: SyntaxNodeRef): void {
    const parent = node.node.parent;
    if (
      node.name !== "URL" ||
      parent?.name === "Link" ||
      parent?.name === "Image"
    ) {
      return;
    }
    const { from, to } = node;
    const isRendered = !this.revealed(from, to);
    this.mark(from, to, isRendered ? "md-link md-link-rendered" : "md-link", {
      "data-href": bareUrlTarget(this.state.sliceDoc(from, to)),
    });
    if (isRendered && parent?.name === "Autolink") {
      this.hide(parent.from, from);
      this.hide(to, parent.to);
    }
  }

  private hideSyntax(node: SyntaxNodeRef): void {
    const { name, from, to } = node;
    const parent = node.node.parent;
    if (!SYNTAX_MARKS.includes(name) || !parent) {
      return;
    }
    if (name === "CodeMark" && parent.name !== "InlineCode") {
      return;
    }
    // Revealed syntax stays faint, as in Obsidian, so the text reads first.
    if (this.revealed(parent.from, parent.to)) {
      this.mark(from, to, "md-syntax-mark");
      return;
    }
    // A setext underline is its own line; Obsidian keeps it, faint.
    if (name === "HeaderMark" && parent.name.startsWith("SetextHeading")) {
      this.mark(from, to, "md-setext-mark");
      return;
    }
    this.hide(
      from,
      to +
        (["HeaderMark", "QuoteMark"].includes(name) &&
        this.state.sliceDoc(to, to + 1) === " "
          ? 1
          : 0),
    );
  }
}

const SYNTAX_MARKS = [
  "EmphasisMark",
  "StrikethroughMark",
  "HeaderMark",
  "CodeMark",
  "QuoteMark",
  "HighlightMark",
];

export const hybridInline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    dragging = false;
    events = new AbortController();
    destroy(): void {
      this.events.abort();
    }
    constructor(view: EditorView) {
      this.decorations = inlineDecorations(view.state, view.visibleRanges);
    }
    update(update: ViewUpdate): void {
      // Keep composition's DOM stable, then rebuild at compositionend.
      if (update.view.composing || this.dragging) {
        this.decorations = this.decorations.map(update.changes);
        return;
      }
      this.decorations = inlineDecorations(
        update.view.state,
        update.view.visibleRanges,
      );
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(_event, view) {
        this.dragging = true;
        view.dom.ownerDocument.addEventListener(
          "mouseup",
          () => {
            this.dragging = false;
            queueMicrotask(() => {
              if (view.dom.isConnected) {
                view.dispatch({});
              }
            });
          },
          { once: true, signal: this.events.signal },
        );
      },
      mouseup(_event, view) {
        this.dragging = false;
        queueMicrotask(() => {
          if (view.dom.isConnected) {
            view.dispatch({});
          }
        });
      },

      compositionend(_event, view) {
        queueMicrotask(() => {
          if (view.dom.isConnected) {
            view.dispatch({});
          }
        });
      },
    },
  },
);

/**
 * A Markdown link's classes. A rendered label pointing outside the vault
 * (any `scheme:` address) carries Obsidian's external-link mark.
 */
export function linkClass(isRendered: boolean, href: string): string {
  if (!isRendered) {
    return "md-link";
  }
  return /^[a-z][a-z\d+.-]*:/i.test(href)
    ? "md-link md-link-rendered md-link-external"
    : "md-link md-link-rendered";
}

/** The address a bare URL opens: GFM links `www.` to https and plain addresses to mail. */
export function bareUrlTarget(text: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) {
    return text;
  }
  return text.includes("@") && !text.includes("/")
    ? `mailto:${text}`
    : `https://${text}`;
}
