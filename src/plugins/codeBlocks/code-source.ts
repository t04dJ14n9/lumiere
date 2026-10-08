import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { StateEffect, type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import type { CodeTokenRange, tokenRanges } from "./code-highlight";

const ready = StateEffect.define<null>();
interface CachedCode {
  text: string;
  language: string;
  tokens: CodeTokenRange[];
}

/** Use the same lazy highlighter in editable fences and rendered code. */
class CodeSource {
  decorations: DecorationSet = Decoration.none;
  private tokenize?: typeof tokenRanges;
  private loading = false;
  private destroyed = false;
  private cache = new Map<number, CachedCode>();

  constructor(view: EditorView) {
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
          if (node.name !== "FencedCode" || visited.has(node.from)) {
            return;
          }
          visited.add(node.from);
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

  private highlightFence(view: EditorView, node: SyntaxNodeRef) {
    if (!fenceSelected(view.state, node)) {
      return undefined;
    }
    const info = node.node.getChild("CodeInfo");
    const code = node.node.getChild("CodeText");
    const language =
      info && /^[\w-]+/.exec(view.state.sliceDoc(info.from, info.to))?.[0];
    if (!code || !language) {
      return undefined;
    }
    if (!this.tokenize) {
      this.loadHighlighter(view);
      return undefined;
    }
    const text = view.state.sliceDoc(code.from, code.to);
    const previous = this.cache.get(node.from);
    const cached =
      previous?.text === text && previous.language === language
        ? previous
        : { text, language, tokens: this.tokenize(text, language) };
    return { code, cached };
  }

  private loadHighlighter(view: EditorView): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    void import("./code-highlight")
      .then((module) => {
        this.tokenize = module.tokenRanges;
        if (!this.destroyed && view.dom.isConnected) {
          view.dispatch({ effects: ready.of(null) });
        }
      })
      .catch(() => {
        this.loading = false;
      });
  }

  update(update: ViewUpdate): void {
    if (update.view.composing) {
      this.decorations = this.decorations.map(update.changes);
    } else if (
      update.docChanged ||
      update.selectionSet ||
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

export const codeSource = ViewPlugin.fromClass(CodeSource, {
  decorations: (plugin) => plugin.decorations,
  eventHandlers: {
    compositionend(_event, view) {
      queueMicrotask(() => {
        if (view.dom.isConnected) {
          view.dispatch({ effects: ready.of(null) });
        }
      });
    },
  },
});

export function fenceSelected(
  state: EditorState,
  node: { from: number; to: number },
): boolean {
  return state.selection.ranges.some(
    (range) =>
      range.to >= node.from &&
      (range.from < node.to ||
        (range.from === node.to && state.doc.lineAt(node.to).from < node.to)),
  );
}
