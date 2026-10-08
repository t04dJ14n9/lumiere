import type { Range } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { EditorView, DecorationSet, ViewUpdate } from "@codemirror/view";
import { linkDestination } from "../../markdown/html";
import { documentTree } from "./document-tree";
import { inlineRenderers, revealed } from "./registry";
class Bullet extends WidgetType {
  override toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.textContent = "•";
    bullet.className = "list-bullet";
    return bullet;
  }
}

function decorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lines = new Set<string>();
  const active = (from: number, to: number): boolean =>
    revealed(view.state, from, to);
  const mark = (
    from: number,
    to: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void => {
    if (from < to) {
      ranges.push(Decoration.mark({ class: cls, attributes }).range(from, to));
    }
  };
  const hide = (from: number, to: number): void => {
    if (from < to) {
      ranges.push(Decoration.replace({}).range(from, to));
    }
  };
  const line = (at: number, cls: string): void => {
    const from = view.state.doc.lineAt(at).from;
    if (lines.has(`${from}:${cls}`)) {
      return;
    }
    lines.add(`${from}:${cls}`);
    ranges.push(Decoration.line({ class: cls }).range(from));
  };
  for (const visible of view.visibleRanges) {
    view.state.field(documentTree).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const { name, from, to } = node;
        const custom = view.state
          .facet(inlineRenderers)
          .find((renderer) => renderer.nodes.includes(name));
        if (custom) {
          custom.decorate(node, {
            state: view.state,
            revealed: active,
            mark,
            hide,
            line,
            replace(from, to, widget) {
              ranges.push(Decoration.replace({ widget }).range(from, to));
            },
          });
          return false;
        }
        if (name === "Highlight") {
          mark(from, to, "md-highlight");
        }
        if (name === "ObsidianComment") {
          mark(from, to, "md-comment");
          return false;
        }
        if (name === "Escape" && !active(from, to)) {
          hide(from, from + 1);
        }
        if (
          name === "ListMark" &&
          /^[-+*]$/.test(view.state.sliceDoc(from, to))
        ) {
          const task = node.node.nextSibling?.getChild("TaskMarker");
          if (task) {
            hide(from, task.from);
          } else if (!active(from, to)) {
            ranges.push(
              Decoration.replace({ widget: new Bullet() }).range(from, to),
            );
          }
        }
        if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
          line(from, `md-heading md-h${name.at(-1)}`);
        }
        if (name === "StrongEmphasis") {
          mark(from, to, "md-strong");
        }
        if (name === "Emphasis") {
          mark(from, to, "md-emphasis");
        }
        if (name === "Strikethrough") {
          mark(from, to, "md-strike");
        }
        if (name === "InlineCode") {
          mark(from, to, "md-inline-code");
        }
        if (name === "Blockquote") {
          for (
            let pos = Math.max(from, visible.from);
            pos <= Math.min(to, visible.to);

          ) {
            const current = view.state.doc.lineAt(pos);
            line(pos, "md-quote");
            pos = current.to + 1;
          }
        }
        if (name === "FencedCode" || name === "Table") {
          for (
            let pos = Math.max(from, visible.from);
            pos <= Math.min(to, visible.to);

          ) {
            const current = view.state.doc.lineAt(pos);
            line(pos, name === "Table" ? "md-table-source" : "md-code-line");
            pos = current.to + 1;
          }
        }
        if (name === "Link") {
          const url = node.node.getChild("URL");
          if (url) {
            const closingLabel = node.node.getChildren("LinkMark")[1];
            const rendered = !active(from, to);
            // A rendered label opens on plain click, as in Obsidian's Live
            // Preview; revealed link source needs Cmd/Ctrl-click.
            mark(
              from + 1,
              closingLabel?.from ?? to,
              rendered ? "md-link md-link-rendered" : "md-link",
              {
                "data-href": linkDestination(
                  view.state.sliceDoc(url.from, url.to),
                ),
              },
            );
            if (rendered) {
              if (closingLabel) {
                hide(closingLabel.from, to);
              }
              hide(from, from + 1);
            }
          }
        }
        const parent = node.node.parent;
        if (
          [
            "EmphasisMark",
            "StrikethroughMark",
            "HeaderMark",
            "CodeMark",
            "QuoteMark",
            "HighlightMark",
          ].includes(name) &&
          parent &&
          !active(parent.from, parent.to)
        ) {
          if (name === "CodeMark" && parent.name !== "InlineCode") {
            return;
          }
          hide(
            from,
            to +
              (["HeaderMark", "QuoteMark"].includes(name) &&
              view.state.sliceDoc(to, to + 1) === " "
                ? 1
                : 0),
          );
        }
        return undefined;
      },
    });
  }
  return Decoration.set(ranges, true);
}

export const hybridInline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    dragging = false;
    events = new AbortController();
    destroy(): void {
      this.events.abort();
    }
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(update: ViewUpdate): void {
      // Keep composition's DOM stable, then rebuild at compositionend.
      if (update.view.composing || this.dragging) {
        this.decorations = this.decorations.map(update.changes);
        return;
      }
      this.decorations = decorations(update.view);
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
