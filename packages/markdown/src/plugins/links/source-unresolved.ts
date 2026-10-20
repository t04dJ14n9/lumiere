/**
 * Source-mode unresolved link dimming (Obsidian `.markdown-source-view
 * .is-unresolved`). Live Preview already paints rendered wikilinks; source
 * mode turns LP off. This marks full `[[…]]` / `[…](…)` / `![[…]]` spans for
 * unresolved targets; `links.css` paints them only under `.is-source-mode`.
 */
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { isUnresolved, unresolvedLinks } from "./api";

const unresolvedMark = Decoration.mark({ class: "is-unresolved" });

/** Mark unresolved wiki / Markdown / embed links for source-mode CSS. */
export function sourceUnresolved(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate): void {
        const unresolvedChanged =
          update.startState.field(unresolvedLinks, false) !==
          update.state.field(unresolvedLinks, false);
        if (update.docChanged || update.viewportChanged || unresolvedChanged) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

/** Unresolved link ranges in `from`–`to` (for tests). */
export function unresolvedSourceMarks(
  state: EditorView["state"],
  from: number,
  to: number,
): { from: number; to: number; href: string }[] {
  const found: { from: number; to: number; href: string }[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const href = linkHref(state, node.name, node.from, node.to, node.node);
      if (href !== undefined && isUnresolved(state, href)) {
        found.push({ from: node.from, to: node.to, href });
      }
    },
  });
  return found;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const builder = new RangeSetBuilder<ReturnType<typeof Decoration.mark>>();
  syntaxTree(state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter(node) {
      const href = linkHref(state, node.name, node.from, node.to, node.node);
      if (href !== undefined && isUnresolved(state, href)) {
        builder.add(node.from, node.to, unresolvedMark);
      }
    },
  });
  return builder.finish();
}

function linkHref(
  state: EditorView["state"],
  name: string,
  from: number,
  to: number,
  node: { getChild(name: string): { from: number; to: number } | null },
): string | undefined {
  if (name === "WikiLink" || name === "WikiEmbed") {
    const open = name === "WikiEmbed" ? 3 : 2;
    if (to - from < open + 2) {
      return undefined;
    }
    return state.sliceDoc(from + open, to - 2);
  }
  if (name !== "Link") {
    return undefined;
  }
  const url = node.getChild("URL");
  if (!url) {
    return undefined;
  }
  let href = state.sliceDoc(url.from, url.to);
  if (href.startsWith("<") && href.endsWith(">")) {
    href = href.slice(1, -1);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    return undefined;
  }
  return href;
}
