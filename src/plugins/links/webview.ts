import { linkSuggestion } from "./suggestions";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type { InlineRenderer } from "../livePreview/api";
import type {} from "./api";
import { markdownParser } from "../../markdown/dialect";
import { noteFragment } from "../../markdown/metadata/fragments";
import { protocol } from "./protocol";
import { unresolvedKey } from "./target";

export function linkAt(
  text: string,
  at: number,
): { href: string; wiki: boolean } | undefined {
  let found: { href: string; wiki: boolean } | undefined;
  markdownParser.parse(text).iterate({
    enter(node) {
      if (node.from > at || node.to < at) {
        return false;
      }
      if (node.name === "WikiLink") {
        found = {
          href: text.slice(node.from + 2, node.to - 2).split("|")[0]!,
          wiki: true,
        };
      }
      if (node.name === "Link") {
        const url = node.node.getChild("URL");
        if (url) {
          found = { href: text.slice(url.from, url.to), wiki: false };
        }
      }
      return undefined;
    },
  });
  return found;
}
export const linksWebview: Plugin = {
  name: "links",
  inject: { required: ["editor", "livePreview", "commands", "rpc"] },
  // Link options are consumed by the host on each request. Keep this view's
  // listeners and initial-navigation lifetime when only those options change.
  reconfigure() {
    return true;
  },
  apply(ctx) {
    ctx.on("suggest/trigger", linkSuggestion);
    const view = ctx.editor.view;
    const navigate = navigator(view);
    const open = linkOpener(ctx, navigate);
    registerNavigation(ctx, navigate);
    registerUnresolvedLinks(ctx);
    registerWikiLinks(ctx);
    registerLinkClicks(ctx, open);
    registerLinkCommands(ctx, open);
  },
};

type Navigate = (target: { fragment: string; at?: number }) => void;
type OpenLink = (
  href: string,
  wiki: boolean,
  side?: boolean,
  source?: string,
) => Promise<boolean>;

function navigator(view: EditorView): Navigate {
  return ({ fragment, at }: { fragment: string; at?: number }) => {
    const target =
      at === undefined
        ? noteFragment(view.state.doc.toString(), fragment)
        : { from: Math.min(at, view.state.doc.length) };
    if (!target) {
      return;
    }
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from),
    });
    view.focus();
  };
}

function linkOpener(ctx: Context, navigate: Navigate): OpenLink {
  return async (href: string, wiki: boolean, side = false, source?: string) => {
    const request = {
      href,
      wiki,
      side,
      ...(source === undefined ? {} : { source }),
    };
    if (ctx.bail("link/click", request)) {
      return true;
    }
    if (href.startsWith("#") && !side && !source) {
      navigate({ fragment: href.slice(1) });
      return true;
    }
    return ctx.rpc.call(protocol, "open", request);
  };
}

function registerNavigation(ctx: Context, navigate: Navigate): void {
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  ctx.effect(() => ctx.rpc.on(protocol, "navigate", navigate));
  void ctx.rpc
    .call(protocol, "initial", {})
    .then((target) => {
      if (live && (target.fragment || target.at !== undefined)) {
        navigate(target);
      }
    })
    .catch((error) => ctx.logger.warn("Initial link navigation failed", error));
}

const setUnresolved = StateEffect.define<ReadonlySet<string>>();
/** The host's unresolved link paths for this note, as `unresolvedKey`s. */
export const unresolvedLinks = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setUnresolved)) {
        value = effect.value;
      }
    }
    return value;
  },
});

function isUnresolved(state: EditorState, href: string): boolean {
  const key = unresolvedKey(href);
  return key !== "" && !!state.field(unresolvedLinks, false)?.has(key);
}

/** Ask the host for the note's unresolved links, then follow its updates. */
function registerUnresolvedLinks(ctx: Context): void {
  const view = ctx.editor.view;
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  const apply = (paths: readonly string[]) => {
    if (live) {
      view.dispatch({ effects: setUnresolved.of(new Set(paths)) });
    }
  };
  ctx.effect(() => ctx.editor.extend(unresolvedLinks));
  ctx.effect(() => ctx.rpc.on(protocol, "unresolvedChanged", apply));
  void ctx.rpc
    .call(protocol, "unresolved", {})
    .then(apply)
    .catch((error) => ctx.logger.warn("Unresolved links unavailable", error));
}

function registerWikiLinks(ctx: Context): void {
  ctx.effect(() => ctx.livePreview.inline(wikiLinkRenderer));
}

export const wikiLinkRenderer: InlineRenderer = {
  nodes: ["WikiLink"],
  decorate(node, cx) {
    const text = cx.state.sliceDoc(node.from + 2, node.to - 2);
    const separator = text.indexOf("|");
    const href = text.split("|")[0]!;
    const revealed = cx.revealed(node.from, node.to);
    const from = node.from + 2 + (separator < 0 ? 0 : separator + 1);
    // Unresolved styling shows only while the link is rendered.
    let cls = "md-link";
    if (!revealed) {
      cls += isUnresolved(cx.state, href)
        ? " md-link-rendered is-unresolved"
        : " md-link-rendered";
    }
    cx.mark(
      revealed ? node.from : from,
      revealed ? node.to : node.to - 2,
      cls,
      { "data-href": href, "data-wiki": "true" },
    );
    if (!revealed) {
      cx.hide(node.from, from);
      cx.hide(node.to - 2, node.to);
    }
  },
};

function registerLinkClicks(ctx: Context, open: OpenLink): void {
  const view = ctx.editor.view;
  const handlers = linkClickHandlers(view, open, (error) =>
    ctx.logger.error("Link failed", error),
  );
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.fromClass(
        class {
          private readonly events = new AbortController();
          constructor() {
            view.dom.addEventListener("mousedown", handlers.mousedown, {
              capture: true,
              signal: this.events.signal,
            });
            view.dom.addEventListener("click", handlers.click, {
              signal: this.events.signal,
            });
          }
          destroy(): void {
            this.events.abort();
          }
        },
      ),
    ),
  );
}

function registerLinkCommands(ctx: Context, open: OpenLink): void {
  const view = ctx.editor.view;
  ctx.effect(() =>
    ctx.commands.register("editor:insert-wikilink", () => {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: `[[${view.state.sliceDoc(selection.from, selection.to)}]]`,
        },
        selection: { anchor: selection.from + 2, head: selection.to + 2 },
      });
      return true;
    }),
  );
  for (const [command, side] of [
    ["editor:follow-link", false],
    ["editor:open-link-in-new-split", true],
  ] as const) {
    ctx.effect(() =>
      ctx.commands.register(command, async () => {
        const link = linkAt(
          view.state.doc.toString(),
          view.state.selection.main.head,
        );
        return link ? open(link.href, link.wiki, side) : false;
      }),
    );
  }
}

function linkClickHandlers(
  view: EditorView,
  open: OpenLink,
  report: (error: unknown) => void,
) {
  return {
    mousedown(event: MouseEvent) {
      const link = clickedLink(event);
      if (
        event.button === 0 &&
        link?.hasAttribute("data-href") &&
        allowsLinkClick(event, link)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    },
    click(event: MouseEvent) {
      const link = clickedLink(event);
      if (!link) {
        return false;
      }
      event.preventDefault();
      const selection = view.dom.ownerDocument.getSelection();
      if (
        !allowsLinkClick(event, link) ||
        (selection &&
          !selection.isCollapsed &&
          (link.contains(selection.anchorNode) ||
            link.contains(selection.focusNode)))
      ) {
        return true;
      }
      const href = link.getAttribute("href") ?? link.dataset.href;
      if (href) {
        void open(
          href,
          link.dataset.wiki === "true" ||
            link.classList.contains("internal-link"),
          (event.metaKey || event.ctrlKey) && event.altKey,
          link.closest<HTMLElement>("[data-note-source]")?.dataset.noteSource,
        ).catch((error) => report(error));
      }
      return true;
    },
  };
}

function clickedLink(event: MouseEvent): HTMLElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>("a, [data-href]")
    : null;
}
function allowsLinkClick(event: MouseEvent, link: HTMLElement): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    link.tagName === "A" ||
    (!event.altKey &&
      !event.shiftKey &&
      link.classList.contains("md-link-rendered"))
  );
}
