import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "./api";
import { markdownParser } from "../../markdown/dialect";
import { noteFragment } from "../../markdown/metadata/fragments";
import { protocol } from "./protocol";

export function linkAt(text: string, at: number): { href: string; wiki: boolean } | undefined {
  let found: { href: string; wiki: boolean } | undefined;
  markdownParser.parse(text).iterate({
    enter(node) {
      if (node.from > at || node.to < at) return false;
      if (node.name === "WikiLink") {
        found = { href: text.slice(node.from + 2, node.to - 2).split("|")[0]!, wiki: true };
      }
      if (node.name === "Link") {
        const url = node.node.getChild("URL");
        if (url) found = { href: text.slice(url.from, url.to), wiki: false };
      }
      return undefined;
    },
  });
  return found;
}
export const linksWebview: Plugin = {
  name: "links",
  inject: { required: ["editor", "livePreview", "commands", "rpc"] },
  apply(ctx) {
    const view = ctx.editor.view;
    const navigate = (fragment: string) => {
      const target = noteFragment(view.state.doc.toString(), fragment);
      if (!target) return;
      view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from) });
      view.focus();
    };
    const open = async (href: string, wiki: boolean, side = false) => {
      const request = { href, wiki, side };
      if (ctx.bail("link/click", request)) return true;
      if (href.startsWith("#") && !side) { navigate(href.slice(1)); return true; }
      return ctx.rpc.call(protocol, "open", request);
    };
    let live = true;
    ctx.effect(() => () => { live = false; });
    ctx.effect(() => ctx.rpc.on(protocol, "navigate", navigate));
    void ctx.rpc.call(protocol, "initial", {}).then((fragment) => {
      if (live && fragment) navigate(fragment);
    }).catch((error) => ctx.logger.warn("Initial link navigation failed", error));
    ctx.effect(() => ctx.livePreview.inline({
      nodes: ["WikiLink"],
      decorate(node, cx) {
        const text = cx.state.sliceDoc(node.from + 2, node.to - 2);
        const separator = text.indexOf("|");
        const href = text.split("|")[0]!;
        const revealed = cx.revealed(node.from, node.to);
        const from = node.from + 2 + (separator < 0 ? 0 : separator + 1);
        cx.mark(revealed ? node.from : from, revealed ? node.to : node.to - 2,
          revealed ? "md-link" : "md-link md-link-rendered", { "data-href": href, "data-wiki": "true" });
        if (!revealed) { cx.hide(node.from, from); cx.hide(node.to - 2, node.to); }
      },
    }));
    const target = (event: MouseEvent) => event.target instanceof Element
      ? event.target.closest<HTMLElement>("a, [data-href]") : null;
    const allowed = (event: MouseEvent, link: HTMLElement) =>
      event.metaKey || event.ctrlKey || link.tagName === "A" ||
      (!event.altKey && !event.shiftKey && link.classList.contains("md-link-rendered"));
    ctx.effect(() => ctx.editor.extend(EditorView.domEventHandlers({
      mousedown(event) {
        const link = target(event);
        if (event.button === 0 && link?.hasAttribute("data-href") && allowed(event, link)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      click(event) {
        const link = target(event);
        if (!link) return false;
        event.preventDefault();
        const selection = view.dom.ownerDocument.getSelection();
        if (!allowed(event, link) || (selection && !selection.isCollapsed &&
            (link.contains(selection.anchorNode) || link.contains(selection.focusNode)))) return true;
        const href = link.getAttribute("href") ?? link.dataset.href;
        if (href) void open(href, link.dataset.wiki === "true" || link.classList.contains("internal-link"),
          (event.metaKey || event.ctrlKey) && event.altKey).catch((error) => ctx.logger.error("Link failed", error));
        return true;
      },
    })));
    ctx.effect(() => ctx.commands.register("editor:insert-wikilink", () => {
      const selection = view.state.selection.main;
      view.dispatch({ changes: { from: selection.from, to: selection.to,
        insert: `[[${view.state.sliceDoc(selection.from, selection.to)}]]` },
        selection: { anchor: selection.from + 2, head: selection.to + 2 } });
      return true;
    }));
    for (const [command, side] of [["editor:follow-link", false], ["editor:open-link-in-new-split", true]] as const) {
      ctx.effect(() => ctx.commands.register(command, async () => {
        const link = linkAt(view.state.doc.toString(), view.state.selection.main.head);
        return link ? open(link.href, link.wiki, side) : false;
      }));
    }
  },
};
