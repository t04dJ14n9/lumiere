import type { Range, EditorState } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import type {
  EditorView,
  DecorationSet,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { metadata } from "../../markdown/metadata";
import { linkDestination } from "../../markdown/html";
import { documentTree } from "./document-tree";
import { renderRevision } from "./blocks";
import {
  decoratePersistentOffViewport,
  inlineRenderers,
  inlineRevealRange,
  revealed,
} from "./registry";
import {
  isPointerSelecting,
  revealFreezeToggled,
} from "../../webview/ui/pointer-selection";
import { decorateListItem } from "./lists";
import { decorateInlineHtml } from "./inline-html";
import { decorateBlockId } from "./block-id";
import { decorateHighlightColour, highlightClass } from "./highlight-colour";
import { decorateCodeLines } from "./code-lines";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";
import { isUnresolved, unresolvedLinks } from "../links/api";
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
  // Persistent inline widgets (tall embeds) must stay in the decoration set
  // off-viewport: otherwise estimatedHeight never reaches the height map and
  // a remount collapses the line to ~one text line (#117 gap).
  decoratePersistentOffViewport(state, builder, visibleRanges);
  return Decoration.set(builder.ranges, true);
}

class InlineDecorations implements InlineContext {
  readonly ranges: Range<Decoration>[] = [];
  private readonly lines = new Set<string>();
  constructor(readonly state: EditorState) {}

  revealed = (from: number, to: number): boolean => {
    const range = inlineRevealRange(this.state, from, to);
    return revealed(this.state, range.from, range.to);
  };
  mark = (
    from: number,
    to: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void => {
    if (from < to) {
      this.ranges.push(
        Decoration.mark({
          class: cls,
          ...(attributes && { attributes }),
        }).range(from, to),
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
    this.ranges.push(
      Decoration.line({ class: cls, ...(attributes && { attributes }) }).range(
        from,
      ),
    );
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
      this.mark(
        from,
        to,
        name === "Highlight" ? highlightClass(this.state, from) : cls,
      );
    }
    if (name === "ObsidianComment") {
      this.mark(from, to, "md-comment");
      return false;
    }
    if (name === "Escape" && !this.lineRevealed(from)) {
      this.hide(from, from + 1);
    }
    decorateListItem(node, this, visible);
    decorateInlineHtml(node, this);
    decorateBlockId(node, this);
    decorateHighlightColour(node, this);
    if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
      // Line 1 gets no space above it (headings.ts marks its number too).
      const isFirstLine = this.state.doc.lineAt(from).number === 1;
      const position = isFirstLine ? " is-first-line" : "";
      this.line(from, `md-heading md-h${name.at(-1)}${position}`);
    }
    this.decorateBlockLines(node, visible);
    decorateCodeLines(node, this, visible);
    this.decorateRule(node);
    this.decorateLink(node);
    this.decorateBareUrl(node);
    this.hideSyntax(node);
    return undefined;
  }

  /**
   * A thematic break stays one line of the same height, as in Obsidian: the
   * rule is drawn on the line, and the caret shows its source in its place.
   */
  private decorateRule(node: SyntaxNodeRef): void {
    if (node.name !== "HorizontalRule") {
      return;
    }
    if (this.lineRevealed(node.from)) {
      this.line(node.from, "md-hr-line is-revealed");
      this.mark(node.from, node.to, "md-syntax-mark");
      return;
    }
    this.line(node.from, "md-hr-line");
    this.hide(node.from, node.to);
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
      // A revealed quote line shows its dim `>` in place of the bar.
      const revealedQuote =
        node.name === "Blockquote" && this.lineRevealed(pos);
      this.line(
        pos,
        revealedQuote ? `${cls} is-revealed` : cls,
        this.lineAttributes(node.name, current.to),
      );
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
    if (!url && !node.node.getChild("LinkLabel")) {
      return;
    }
    const closingLabel = node.node.getChildren("LinkMark")[1];
    const isRendered = !this.revealed(from, to);
    const href = url
      ? linkDestination(this.state.sliceDoc(url.from, url.to))
      : metadata(this.state.doc).links.find(
          (link) => link.position.start.offset === from,
        )?.link;

    // Rendered labels: plain click reveals source; Mod-click follows (BH-020).
    // When revealed, mark the full [label](url) span with data-href so Mod-click
    // and Mod-hover preview work anywhere on the link syntax.
    this.mark(
      isRendered ? from + 1 : from,
      isRendered ? (closingLabel?.from ?? to) : to,
      linkClass(
        isRendered,
        href ?? "",
        !!href && isUnresolved(this.state, href),
      ),
      href ? { "data-href": href } : undefined,
    );
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
    const element = parent?.name === "Autolink" ? parent : node;
    const isRendered = !this.revealed(element.from, element.to);
    this.mark(from, to, isRendered ? "md-link md-link-rendered" : "md-link", {
      "data-href": bareUrlTarget(this.state.sliceDoc(from, to)),
    });
    if (isRendered && parent?.name === "Autolink") {
      this.hide(parent.from, from);
      this.hide(to, parent.to);
    }
  }

  private lineRevealed(at: number): boolean {
    const line = this.state.doc.lineAt(at);
    return revealed(this.state, line.from, line.to);
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
    if (
      ["QuoteMark", "HeaderMark"].includes(name)
        ? this.lineRevealed(from)
        : this.revealed(parent.from, parent.to)
    ) {
      this.mark(from, to, "md-syntax-mark");
      if (
        name === "HeaderMark" &&
        parent.name.startsWith("ATXHeading") &&
        from === parent.from
      ) {
        let spaceEnd = to;
        while (this.state.sliceDoc(spaceEnd, spaceEnd + 1) === " ") {
          spaceEnd++;
        }
        if (spaceEnd > to) {
          this.mark(to, spaceEnd, "md-header-space");
        }
      }
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

function shouldRebuildInline(update: ViewUpdate): boolean {
  if (
    update.docChanged ||
    update.viewportChanged ||
    update.selectionSet ||
    update.focusChanged
  ) {
    return true;
  }
  const { startState, state } = update;
  if (startState === state) {
    return false;
  }
  return (
    startState.field(documentTree) !== state.field(documentTree) ||
    startState.facet(inlineRenderers) !== state.facet(inlineRenderers) ||
    startState.field(unresolvedLinks, false) !==
      state.field(unresolvedLinks, false) ||
    startState.field(renderRevision, false) !==
      state.field(renderRevision, false) ||
    revealFreezeToggled(startState, state)
  );
}

export class HybridInline {
  decorations: DecorationSet;
  private wasComposing = false;
  constructor(view: EditorView) {
    this.decorations = inlineDecorations(view.state, view.visibleRanges);
  }
  update(update: ViewUpdate): void {
    // Selection-only pointer updates keep the DOM stable. Scrollbar presses
    // also freeze reveal, but new viewport content still needs decorations;
    // revealRanges keeps those tied to the selection from before the press.
    if (
      update.view.composing ||
      (isPointerSelecting(update.state) && !update.viewportChanged)
    ) {
      this.wasComposing = update.view.composing;
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    const endedComposing = this.wasComposing && !update.view.composing;
    this.wasComposing = false;
    if (!endedComposing && !shouldRebuildInline(update)) {
      return;
    }
    this.decorations = inlineDecorations(
      update.view.state,
      update.view.visibleRanges,
    );
  }
}

export const hybridInline = ViewPlugin.fromClass(HybridInline, {
  decorations: (plugin) => plugin.decorations,
  eventHandlers: {
    compositionend(_event, view) {
      queueMicrotask(() => {
        if (view.dom.isConnected) {
          view.dispatch({});
        }
      });
    },
  },
});

/**
 * A Markdown link's classes. A rendered label pointing outside the vault
 * (any `scheme:` address) carries Obsidian's external-link mark. Internal
 * misses get `is-unresolved`, same as rendered wikilinks.
 */
export function linkClass(
  isRendered: boolean,
  href: string,
  unresolved = false,
): string {
  if (!isRendered) {
    return "md-link";
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    return "md-link md-link-rendered md-link-external";
  }
  return unresolved
    ? "md-link md-link-rendered is-unresolved"
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
