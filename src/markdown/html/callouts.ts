import type MarkdownIt from "markdown-it";
const calloutAliases: Record<string, string> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};
const calloutKinds = new Set([
  "note",
  "abstract",
  "info",
  "todo",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
]);
interface Callout {
  kind: string;
  title: string;
  fold?: string;
}
export function callouts(md: MarkdownIt, calloutIcon: (kind: string) => string = () => ""): void {
  md.core.ruler.after("inline", "callouts", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!;
      if (token.type !== "blockquote_open") {
        continue;
      }
      const paragraph = state.tokens[index + 1],
        inline = state.tokens[index + 2];
      if (paragraph?.type !== "paragraph_open" || inline?.type !== "inline") {
        continue;
      }
      const match = /^\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(inline.content);
      if (!match) {
        continue;
      }
      let depth = 1,
        closing = index + 1;
      for (; closing < state.tokens.length; closing++) {
        if (state.tokens[closing]!.type === "blockquote_open") {
          depth++;
        }
        if (state.tokens[closing]!.type === "blockquote_close" && --depth === 0) {
          break;
        }
      }
      const raw = match[1]!.toLowerCase(),
        canonical = calloutAliases[raw] ?? raw;
      token.type = "callout_open";
      token.meta = {
        kind: calloutKinds.has(canonical) ? canonical : "note",
        title: match[3] || raw[0]!.toUpperCase() + raw.slice(1),
        fold: match[2],
      } satisfies Callout;
      const close = state.tokens[closing];
      if (close) {
        close.type = "callout_close";
        close.meta = {
          kind: calloutKinds.has(canonical) ? canonical : "note",
          title: match[3] || raw[0]!.toUpperCase() + raw.slice(1),
          fold: match[2],
        } satisfies Callout;
      }
      inline.content = inline.content.slice(match[0].length);
      inline.children = [];
      md.inline.parse(inline.content, md, state.env, inline.children);
      if (!inline.content) {
        paragraph.hidden = true;
        state.tokens[index + 3]!.hidden = true;
      }
    }
  });
  md.renderer.rules.callout_open = (tokens, index, _options, env) => {
    const data = tokens[index]!.meta as Callout,
      title = md.renderInline(data.title, env);
    const icon = calloutIcon(data.kind);
    return data.fold
      ? `<details class="callout" data-callout="${data.kind}"${data.fold === "+" ? " open" : ""}><summary class="callout-title">${icon}${title}</summary><div class="callout-content">`
      : `<aside class="callout" data-callout="${data.kind}"><div class="callout-title">${icon}${title}</div><div class="callout-content">`;
  };
  md.renderer.rules.callout_close = (tokens, index) =>
    `</div></${(tokens[index]!.meta as Callout).fold ? "details" : "aside"}>`;
}
