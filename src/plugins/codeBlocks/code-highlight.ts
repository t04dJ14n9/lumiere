import Prism from "prism-all-languages";
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
        const aliases = Array.isArray(tokens.alias)
          ? tokens.alias
          : tokens.alias
            ? [tokens.alias]
            : [];
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
