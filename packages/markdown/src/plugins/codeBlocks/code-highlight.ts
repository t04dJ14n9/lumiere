import { highlightTree } from "@lezer/highlight";
import Prism, { languageAliases, languageLoaders } from "prism-languages";
import { createLanguageLoader } from "./language-loader";
import {
  LEZER_ALIASES,
  lezerLoaders,
  lezerTagHighlighter,
  loadedLezer,
  normalizeLanguageName,
  resolveLezerId,
  type LezerLanguageSpec,
} from "./lezer-languages";
import { collectAstOverrides } from "./lezer-overrides";

export interface CodeTokenRange {
  from: number;
  to: number;
  classes: string;
}

const ensureLezerLanguage = createLanguageLoader(lezerLoaders, LEZER_ALIASES);
const ensurePrismLanguage = createLanguageLoader(
  languageLoaders,
  languageAliases,
);

/** Rendered Markdown code can itself contain fences in arbitrary languages. */
export async function loadLanguage(
  language: string,
  source = "",
): Promise<void> {
  const lezerId = resolveLezerId(language);
  if (lezerId) {
    await ensureLezerLanguage(lezerId);
    if (lezerId === "markdown" && source) {
      await loadEmbeddedMarkdownLanguages(source);
    }
    return;
  }
  await ensurePrismLanguage(normalizeLanguageName(language));
}

async function loadEmbeddedMarkdownLanguages(source: string): Promise<void> {
  const embedded = extractMarkdownFenceLanguages(source);
  await Promise.all(
    embedded.map((lang) => {
      const embeddedLezer = resolveLezerId(lang);
      return embeddedLezer
        ? ensureLezerLanguage(embeddedLezer)
        : ensurePrismLanguage(normalizeLanguageName(lang));
    }),
  );
}

function extractMarkdownFenceLanguages(source: string): string[] {
  const found = new Set<string>();
  const regex = /^[ \t]*(?:```+|~~~+)[ \t]*([^\s`~]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const label = match[1]?.trim();
    if (label) {
      found.add(label);
    }
  }
  return [...found];
}

export function isLezerLanguageLoaded(language: string): boolean {
  const id = resolveLezerId(language);
  return Boolean(id && loadedLezer.has(id));
}

export function highlight(element: HTMLElement): void {
  const language = /language-([\w-]+)/.exec(element.className)?.[1];
  if (!language) {
    return;
  }
  const source = element.textContent ?? "";
  const lezerId = resolveLezerId(language);
  if (lezerId) {
    const spec = loadedLezer.get(lezerId);
    if (spec) {
      element.innerHTML = renderRangesToHtml(
        source,
        lezerTokenRanges(source, spec),
      );
    }
    return;
  }
  const normalized = normalizeLanguageName(language);
  const grammar = Prism.languages[language] ?? Prism.languages[normalized];
  if (grammar) {
    element.innerHTML = Prism.highlight(source, grammar, normalized);
  }
}

/** Token offsets are UTF-16 offsets, matching the source document. */
export function tokenRanges(
  source: string,
  language: string,
): CodeTokenRange[] {
  if (!source) {
    return [];
  }
  const lezerId = resolveLezerId(language);
  if (lezerId) {
    const spec = loadedLezer.get(lezerId);
    return spec ? lezerTokenRanges(source, spec) : [];
  }
  const normalized = normalizeLanguageName(language);
  const grammar = Prism.languages[language] ?? Prism.languages[normalized];
  return grammar ? prismTokenRanges(source, grammar) : [];
}

function lezerTokenRanges(
  source: string,
  spec: LezerLanguageSpec,
): CodeTokenRange[] {
  const tree = spec.parser.parse(source);
  const baseRanges: CodeTokenRange[] = [];
  highlightTree(tree, lezerTagHighlighter, (from, to, classes) => {
    if (to > from) {
      baseRanges.push({ from, to, classes: normalizeTokenClasses(classes) });
    }
  });
  const { overrides, removeSpans } = collectAstOverrides(
    source,
    spec.id,
    tree,
    prismTokenRanges,
  );
  if (overrides.size === 0 && removeSpans.length === 0) {
    return baseRanges;
  }
  const merged = new Map<string, CodeTokenRange>();
  for (const range of baseRanges) {
    const insideRemoved = removeSpans.some(
      (span) => range.from >= span.from && range.to <= span.to,
    );
    if (!insideRemoved) {
      merged.set(`${range.from}:${range.to}`, range);
    }
  }
  for (const [key, range] of overrides) {
    merged.set(key, range);
  }
  return [...merged.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

function normalizeTokenClasses(classes: string): string {
  const unique = new Set<string>(["token"]);
  for (const part of classes.split(/\s+/)) {
    if (part && part !== "token") {
      unique.add(part);
    }
  }
  return [...unique].join(" ");
}

function prismTokenRanges(
  source: string,
  grammar: Prism.Grammar,
): CodeTokenRange[] {
  const result: CodeTokenRange[] = [];
  let offset = 0;
  const visit = (tokens: Prism.TokenStream): void => {
    if (typeof tokens === "string") {
      offset += tokens.length;
    } else if (Array.isArray(tokens)) {
      tokens.forEach(visit);
    } else {
      const from = offset;
      visit(tokens.content);
      if (offset > from) {
        const aliases = tokenAliases(tokens.alias);
        result.push({
          from,
          to: offset,
          classes: ["token", tokens.type, ...aliases].join(" "),
        });
      }
    }
  };
  visit(Prism.tokenize(source, grammar));
  return result;
}

function tokenAliases(alias: string | string[] | undefined): string[] {
  if (Array.isArray(alias)) {
    return alias;
  }
  return alias ? [alias] : [];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderRangesToHtml(
  source: string,
  ranges: readonly CodeTokenRange[],
): string {
  if (ranges.length === 0) {
    return escapeHtml(source);
  }
  let html = "";
  let pos = 0;
  for (const range of ranges) {
    if (range.from < pos) {
      continue;
    }
    if (range.from > pos) {
      html += escapeHtml(source.slice(pos, range.from));
    }
    html += `<span class="${range.classes}">${escapeHtml(
      source.slice(range.from, range.to),
    )}</span>`;
    pos = range.to;
  }
  if (pos < source.length) {
    html += escapeHtml(source.slice(pos));
  }
  return html;
}
