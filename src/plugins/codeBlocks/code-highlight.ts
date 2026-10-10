import Prism, { languageLoaders, languageAliases } from "prism-languages";
import { createLanguageLoader } from "./language-loader";

const ensureLanguage = createLanguageLoader(languageLoaders, languageAliases);

/** Rendered Markdown code can itself contain fences in arbitrary languages. */
export async function loadLanguage(
  language: string,
  source = "",
): Promise<void> {
  await ensureLanguage(language);
  const id = languageAliases.get(language) ?? language;
  const grammar = Prism.languages[language];
  if (id === "markdown" && source && grammar) {
    const embedded = embeddedLanguages(Prism.tokenize(source, grammar));
    await Promise.all(embedded.map(ensureLanguage));
  }
}

function embeddedLanguages(tokens: Prism.TokenStream): string[] {
  if (typeof tokens === "string") {
    return [];
  }
  if (Array.isArray(tokens)) {
    return tokens.flatMap(embeddedLanguages);
  }
  if (tokens.type !== "code-language" || typeof tokens.content !== "string") {
    return embeddedLanguages(tokens.content);
  }
  // Match Prism's Markdown language labels, including C++, C# and F#.
  const label = tokens.content
    .replace(/\b#/g, "sharp")
    .replace(/\b\+\+/g, "pp");
  const language = /[a-z][\w-]*/i.exec(label)?.[0].toLowerCase();
  return language ? [language] : [];
}
export function highlight(element: HTMLElement): void {
  const language = /language-([\w-]+)/.exec(element.className)?.[1];
  const grammar = language ? Prism.languages[language] : undefined;
  if (language && grammar) {
    element.innerHTML = Prism.highlight(
      element.textContent ?? "",
      grammar,
      language,
    );
  }
}

export interface CodeTokenRange {
  from: number;
  to: number;
  classes: string;
}

/** Prism token offsets are UTF-16 offsets, matching the source document. */
export function tokenRanges(
  source: string,
  language: string,
): CodeTokenRange[] {
  const grammar = Prism.languages[language];
  if (!grammar) {
    return [];
  }
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
