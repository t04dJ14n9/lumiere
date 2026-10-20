import { linkSuggestion } from "./suggestions";
import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type { InlineRenderer } from "../livePreview/api";
import { isUnresolved, setUnresolved, unresolvedLinks } from "./api";
export { isUnresolved, unresolvedLinks } from "./api";
import { noteFragment } from "../../markdown/metadata/fragments";
import { protocol } from "./protocol";
import { linkAt, followCaretLink } from "./caret-link";
import { linkClickHandlers, type OpenLink } from "./clicks";
import { tagUnresolvedAnchors } from "./tag-unresolved-anchors";
export { linkAt } from "./caret-link";

export const linksWebview: Plugin = {
  name: "links",
  inject: { required: ["editor", "livePreview", "commands", "rpc"] },
  provides: ["links"],
  // Link options are consumed by the host on each request. Keep this view's
  // listeners and navigation-session lifetime when only those options change.
  reconfigure() {
    return true;
  },
  apply(ctx) {
    ctx.on("suggest/trigger", linkSuggestion);
    const navigate = navigator(ctx);
    const open = linkOpener(ctx, navigate);
    registerNavigation(ctx, navigate);
    registerUnresolvedLinks(ctx);
    registerEmbedUnresolved(ctx);
    registerWikiLinks(ctx);
    registerLinkClicks(ctx, open);
    registerLinkCommands(ctx, open);
    registerLinkFollowing(ctx, open);
  },
};

type Navigate = (target: { fragment: string; at?: number }) => boolean;

function navigator(ctx: Context): Navigate {
  const view = ctx.editor.view;
  return ({ fragment, at }: { fragment: string; at?: number }) => {
    const target =
      at === undefined
        ? noteFragment(view.state.doc.toString(), fragment)
        : { from: Math.min(at, view.state.doc.length) };
    if (!target) {
      void ctx.rpc
        .call(protocol, "missing", { fragment })
        .catch((error) =>
          ctx.logger.warn("Missing-fragment message failed", error),
        );
      return false;
    }
    ctx.editor.navigate(() => {
      // Focusing after measured scrolling can restore the previous viewport.
      view.focus();
      view.dispatch({
        selection: { anchor: target.from },
        // Centre the target as VS Code's Outline and Obsidian's do. The browser
        // clamps the scroll at both ends, so a heading near the start or end
        // of the note lands as close to the centre as the note allows.
        effects: EditorView.scrollIntoView(target.from, { y: "center" }),
      });
    });
    return true;
  };
}

function linkOpener(ctx: Context, navigate: Navigate): OpenLink {
  return async (href, wiki, { side = false, tab = false, source } = {}) => {
    const request = {
      href,
      wiki,
      side,
      tab,
      ...(source === undefined ? {} : { source }),
    };
    if (ctx.bail("link/click", request)) {
      return true;
    }
    if (href.startsWith("#") && !side && !source) {
      return navigate({ fragment: href.slice(1) });
    }
    return ctx.rpc.call(protocol, "open", request);
  };
}

function registerNavigation(ctx: Context, navigate: Navigate): void {
  const session = crypto.getRandomValues(new Uint32Array(4)).join("-");
  let live = true;
  let latest = 0;
  ctx.effect(() => () => {
    live = false;
  });
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "navigate", async (target, token) => {
      if (
        token.cancelled ||
        target.session !== session ||
        !live ||
        target.requestId <= latest
      ) {
        return false;
      }
      latest = target.requestId;
      if (!navigate(target)) {
        return false;
      }
      const state = ctx.editor.view.state;
      return (
        (await ctx.editor.settled()) &&
        !token.cancelled &&
        live &&
        latest === target.requestId &&
        state.selection.eq(ctx.editor.view.state.selection) &&
        state.doc.eq(ctx.editor.view.state.doc)
      );
    }),
  );
  void ctx.rpc
    .call(protocol, "ready", { session })
    .catch((error) =>
      ctx.logger.warn("Link navigation readiness failed", error),
    );
}

/** Ask the host for the note's unresolved links, then follow its updates. */
function registerUnresolvedLinks(ctx: Context): void {
  const view = ctx.editor.view;
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  const apply = (paths: readonly string[]) => {
    if (!live) {
      return;
    }
    view.dispatch({ effects: setUnresolved.of(new Set(paths)) });
    void refreshRenderedUnresolved(ctx, view);
  };
  ctx.effect(() => ctx.editor.extend(unresolvedLinks));
  ctx.effect(() => ctx.rpc.on(protocol, "unresolvedChanged", apply));
  void ctx.rpc
    .call(protocol, "unresolved", {})
    .then(apply)
    .catch((error) => ctx.logger.warn("Unresolved links unavailable", error));
}

/**
 * Dim unresolved anchors inside rendered HTML (note embeds) using that note's
 * outbound unresolved set — not the host note's.
 */
function registerEmbedUnresolved(ctx: Context): void {
  ctx.on("render/postProcess", (pass) => {
    const source = pass.documentUri;
    void ctx.rpc
      .call(protocol, "unresolved", source ? { source } : {})
      .then((paths) => {
        tagUnresolvedAnchors(pass.container, new Set(paths));
      })
      .catch((error) =>
        ctx.logger.warn("Embed unresolved links unavailable", error),
      );
  });
}

/** Re-tag every rendered surface after the vault re-resolves links. */
async function refreshRenderedUnresolved(
  ctx: Context,
  view: EditorView,
): Promise<void> {
  const roots = [
    ...view.contentDOM.querySelectorAll<HTMLElement>(".markdown-rendered"),
  ];
  if (roots.length === 0) {
    return;
  }
  const groups = new Map<string, HTMLElement[]>();
  for (const root of roots) {
    const source = root.dataset.noteSource ?? "";
    const list = groups.get(source) ?? [];
    list.push(root);
    groups.set(source, list);
  }
  for (const [source, elements] of groups) {
    try {
      const paths = await ctx.rpc.call(
        protocol,
        "unresolved",
        source ? { source } : {},
      );
      const unresolved = new Set(paths);
      for (const element of elements) {
        tagUnresolvedAnchors(element, unresolved);
      }
    } catch (error) {
      ctx.logger.warn("Embed unresolved refresh failed", error);
    }
  }
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
    // A link within the note shows without its `#`, as in Obsidian.
    const local = separator < 0 && href.length > 1 && href.startsWith("#");
    // Text starts after `[[`, and after the alias's `|` or a local `#`.
    let skip = separator + 1;
    if (separator < 0) {
      skip = local ? 1 : 0;
    }
    const from = node.from + 2 + skip;
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
        // As in Obsidian: the caret after the text, ready for an alias or `#`.
        selection: { anchor: selection.to + 2 },
      });
      return true;
    }),
  );
  for (const [command, place] of [
    ["editor:follow-link", {}],
    ["editor:open-link-in-new-leaf", { tab: true }],
    ["editor:open-link-in-new-split", { side: true }],
  ] as const) {
    ctx.effect(() =>
      ctx.commands.register(command, async () => {
        const link = linkAt(
          view.state.doc.toString(),
          view.state.selection.main.head,
        );
        return link ? open(link.href, link.wiki, place) : false;
      }),
    );
  }
}

function registerLinkFollowing(ctx: Context, open: OpenLink): void {
  const follow = (view: EditorView) =>
    followCaretLink(view, open, (error) =>
      ctx.logger.warn("Follow link failed", error),
    );
  ctx.provide("links", { follow });
  ctx.effect(() =>
    ctx.editor.extend(
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: follow,
          },
        ]),
      ),
    ),
  );
}
