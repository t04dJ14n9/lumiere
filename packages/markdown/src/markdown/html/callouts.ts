import type { MarkdownIt } from "markdown-it";
import type { StateCore } from "markdown-it";
import type { Token } from "markdown-it";
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
interface Callout {
  kind: string;
  title: string;
  fold?: string;
}
export function callouts(
  md: MarkdownIt,
  calloutIcon: (kind: string) => string = () => "",
): void {
  md.core.ruler.after("inline", "callouts", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      transformCallout(md, state, index);
    }
  });
  md.renderer.rules.callout_open = (tokens, index, _options, env) => {
    const data = tokens[index]!.meta as unknown as Callout;
    const title = md.renderInline(data.title, env);
    const heading = `${calloutIcon(data.kind)}<span class="callout-title-text">${title}</span>`;
    return data.fold
      ? `<details class="callout" data-callout="${data.kind}"${data.fold === "+" ? " open" : ""}><summary class="callout-title">${heading}<button type="button" class="callout-fold" aria-label="Toggle callout">›</button></summary><div class="callout-content">`
      : `<aside class="callout" data-callout="${data.kind}"><div class="callout-title">${heading}</div><div class="callout-content">`;
  };
  md.renderer.rules.callout_close = (tokens, index) =>
    `</div></${(tokens[index]!.meta as unknown as Callout).fold ? "details" : "aside"}>`;
}

function transformCallout(
  md: MarkdownIt,
  state: StateCore,
  index: number,
): void {
  const token = state.tokens[index]!;
  if (token.type !== "blockquote_open") {
    return;
  }
  const paragraph = state.tokens[index + 1];
  const inline = state.tokens[index + 2];
  if (paragraph?.type !== "paragraph_open" || inline?.type !== "inline") {
    return;
  }
  const match = /^\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(
    inline.content,
  );
  if (!match) {
    return;
  }
  const closing = closingQuote(state.tokens, index);
  token.type = "callout_open";
  token.meta = { ...calloutData(match) };
  const close = state.tokens[closing];
  if (close) {
    close.type = "callout_close";
    close.meta = { ...calloutData(match) };
  }
  inline.content = inline.content.slice(match[0].length);
  inline.children = [];
  md.inline.parse(inline.content, md, state.env, inline.children);
  if (!inline.content) {
    paragraph.hidden = true;
    state.tokens[index + 3]!.hidden = true;
  }
}

function closingQuote(tokens: Token[], index: number): number {
  let depth = 1;
  let closing = index + 1;
  for (; closing < tokens.length; closing++) {
    if (tokens[closing]!.type === "blockquote_open") {
      depth++;
    }
    if (tokens[closing]!.type === "blockquote_close" && --depth === 0) {
      break;
    }
  }
  return closing;
}

/** A callout without a title shows its type, capitalised, hyphens as spaces. */
function defaultTitle(type: string): string {
  const words = type.replace(/-/g, " ");
  return words[0]!.toUpperCase() + words.slice(1);
}

function calloutData(match: RegExpExecArray): Callout {
  const raw = match[1]!.toLowerCase();
  const canonical = calloutAliases[raw] ?? raw;
  const fold = match[2];
  return {
    kind: canonical,
    title: match[3] || defaultTitle(raw),
    ...(fold === undefined ? {} : { fold }),
  };
}
