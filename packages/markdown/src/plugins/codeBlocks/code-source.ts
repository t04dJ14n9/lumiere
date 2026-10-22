import { syntaxTree } from "@codemirror/language";
import {
  isRevealFrozen,
  revealFreezeToggled,
} from "../../webview/ui/pointer-selection";
import type { SyntaxNodeRef } from "@lezer/common";
import { StateEffect, type Range } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import type { CodeTokenRange } from "./code-highlight";
import type * as CodeHighlighter from "./code-highlight";
import {
  FenceFlair,
  fenceInfo,
  fenceOpenLine,
  fenceRevealed,
  setFenceHover,
} from "./fence-flair";

const ready = StateEffect.define<null>();
interface CachedCode {
  text: string;
  language: string;
  tokens: CodeTokenRange[];
}

/** Use the same lazy highlighter in editable fences and rendered code. */
export class CodeSource {
  decorations: DecorationSet = Decoration.none;
  private readonly copy: (text: string) => void;
  private highlighter?: typeof CodeHighlighter;
  private readonly languageLoads = new Map<string, "loading" | "ready">();
  private destroyed = false;
  private cache = new Map<number, CachedCode>();

  constructor(view: EditorView, copy: (text: string) => void) {
    this.copy = copy;
    this.build(view);
  }

  private build(view: EditorView): void {
    const marks: Range<Decoration>[] = [];
    const next = new Map<number, CachedCode>();
    const visited = new Set<number>();
    for (const visible of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from: visible.from,
        to: visible.to,
        enter: (node) => {
          if (node.name === "HTMLBlock" && !visited.has(node.from)) {
            visited.add(node.from);
            this.highlightHtml(view, node, marks, next);
            return false;
          }
          if (node.name !== "FencedCode" || visited.has(node.from)) {
            return;
          }
          visited.add(node.from);
          this.flair(view, node, marks);
          const highlighted = this.highlightFence(view, node);
          if (!highlighted) {
            return false;
          }
          const { code, cached } = highlighted;
          next.set(node.from, cached);
          for (const token of cached.tokens) {
            const from = code.from + token.from;
            const to = code.from + token.to;
            if (to > visible.from && from < visible.to) {
              marks.push(
                Decoration.mark({ class: token.classes }).range(from, to),
              );
            }
          }
          return false;
        },
      });
    }
    this.cache = next;
    this.decorations = Decoration.set(marks, true);
  }

  /** The label and copy button, in the opening fence line it hides. */
  private flair(
    view: EditorView,
    node: SyntaxNodeRef,
    marks: Range<Decoration>[],
  ): void {
    if (fenceRevealed(view.state, node)) {
      return;
    }
    const { language, code } = fenceInfo(view.state, node);
    marks.push(
      Decoration.widget({
        side: 1,
        widget: new FenceFlair(language, code, this.copy),
      }).range(view.state.doc.lineAt(node.from).to),
    );
  }

  /**
   * A revealed HTML block keeps its syntax colours, as in Obsidian: tag
   * names, attributes, values and dim angle brackets.
   */
  private highlightHtml(
    view: EditorView,
    node: SyntaxNodeRef,
    marks: Range<Decoration>[],
    next: Map<number, CachedCode>,
  ): void {
    if (!fenceRevealed(view.state, node)) {
      return;
    }
    const language = "html";
    if (!this.highlighter || this.languageLoads.get(language) !== "ready") {
      this.loadHighlighter(view, language);
      return;
    }
    const text = view.state.sliceDoc(node.from, node.to);
    const previous = this.cache.get(node.from);
    const cached =
      previous?.text === text && previous.language === language
        ? previous
        : {
            text,
            language,
            tokens: this.highlighter.tokenRanges(text, language),
          };
    next.set(node.from, cached);
    for (const token of cached.tokens) {
      marks.push(
        Decoration.mark({ class: token.classes }).range(
          node.from + token.from,
          node.from + token.to,
        ),
      );
    }
  }

  private highlightFence(view: EditorView, node: SyntaxNodeRef) {
    const code = node.node.getChild("CodeText");
    const { language } = fenceInfo(view.state, node);
    if (!code || !language) {
      return undefined;
    }
    if (!this.highlighter || this.languageLoads.get(language) !== "ready") {
      this.loadHighlighter(view, language);
      return undefined;
    }
    const text = view.state.sliceDoc(code.from, code.to);
    const previous = this.cache.get(node.from);
    const cached =
      previous?.text === text && previous.language === language
        ? previous
        : {
            text,
            language,
            tokens: this.highlighter.tokenRanges(text, language),
          };
    return { code, cached };
  }

  private loadHighlighter(view: EditorView, language: string): void {
    if (this.languageLoads.has(language)) {
      return;
    }
    this.languageLoads.set(language, "loading");
    void import("./code-highlight")
      .then(async (module) => {
        await module.loadLanguage(language);
        this.highlighter = module;
        this.languageLoads.set(language, "ready");
        if (!this.destroyed && view.dom.isConnected) {
          view.dispatch({ effects: ready.of(null) });
        }
      })
      .catch(() => {
        this.languageLoads.delete(language);
      });
  }

  update(update: ViewUpdate): void {
    if (update.view.composing) {
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    if (
      update.docChanged ||
      (update.selectionSet && !isRevealFrozen(update.state)) ||
      revealFreezeToggled(update.startState, update.state) ||
      update.viewportChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state) ||
      update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(ready)),
      )
    ) {
      this.build(update.view);
    }
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** Highlighted fences, with a copy button that writes through `copy`. */
export const codeSource = (copy: (text: string) => void) =>
  ViewPlugin.define((view) => new CodeSource(view, copy), {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      compositionend(_event, view) {
        queueMicrotask(() => {
          if (view.dom.isConnected) {
            view.dispatch({ effects: ready.of(null) });
          }
        });
      },
      // Obsidian: Copy appears for the whole fence, not only the opening strip.
      mouseover(event, view) {
        if (!(event.target instanceof Element)) {
          return;
        }
        setFenceHover(
          view.contentDOM,
          fenceOpenLine(event.target.closest(".cm-line")),
        );
      },
      mouseout(event, view) {
        const related = event.relatedTarget;
        if (related instanceof Element && view.contentDOM.contains(related)) {
          const open = fenceOpenLine(related.closest(".cm-line"));
          if (open) {
            setFenceHover(view.contentDOM, open);
            return;
          }
        }
        setFenceHover(view.contentDOM, null);
      },
    },
  });
