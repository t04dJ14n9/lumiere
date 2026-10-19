import { isMarpDocument } from "../../markdown/marp";
import { frontmatter } from "../../markdown/properties";
import { pageContract, frontmatterType } from "../../shared/wiki-page";
import { span, type DiagnosticItem } from "../../shared/workspace-files";
import type { ResolvedLayout } from "./api";
import { notePlace } from "./place";

const WIKILINK = /!?\[\[[^\]\n]+\]\]/g;

export function diagnoseNote(
  layout: ResolvedLayout,
  relativePath: string,
  text: string,
): DiagnosticItem[] {
  const place = notePlace(layout, relativePath);
  if (!place.insideBundle || !relativePath.endsWith(".md")) {
    return [];
  }
  const items: DiagnosticItem[] = [];
  const header = frontmatter(text);
  if (header?.error) {
    items.push(
      item(text, "Wiki frontmatter could not be read.", 0, header.end),
    );
  }
  items.push(...contractItems(layout, place.reserved, text, header?.values));
  for (const link of wikilinkSpans(text)) {
    items.push(
      item(
        text,
        "Wikilinks are not portable. Use a Markdown link such as [label](note.md).",
        link.from,
        link.to,
      ),
    );
  }
  return items;
}

function contractItems(
  layout: ResolvedLayout,
  reserved: boolean,
  text: string,
  values: Record<string, unknown> | undefined,
): DiagnosticItem[] {
  if (reserved) {
    return [];
  }
  if (isMarpDocument(text) && !pageContract(values).ok) {
    return [
      item(
        text,
        "This Marp deck is inside the wiki bundle without a page contract (type and generated provenance). Keep it outside the bundle and link to it. This editor will not add that frontmatter.",
        0,
        0,
      ),
    ];
  }
  if (!isMarpDocument(text) && !frontmatterType(values)) {
    return [
      item(text, `This page in ${layout.bundle}/ has no type property.`, 0, 0),
    ];
  }
  return [];
}

export function wikilinkSpans(text: string): { from: number; to: number }[] {
  const bodyStart = frontmatter(text)?.end ?? 0;
  const found: { from: number; to: number }[] = [];
  const state = { offset: 0, bodyStart, fenced: false };
  for (const line of text.split("\n")) {
    state.fenced = scanLine(line, state, found);
    state.offset += line.length + 1;
  }
  return found;
}

function scanLine(
  line: string,
  state: { offset: number; bodyStart: number; fenced: boolean },
  found: { from: number; to: number }[],
): boolean {
  if (state.offset < state.bodyStart) {
    return state.fenced;
  }
  if (/^\s*(`{3,}|~{3,})/.test(line)) {
    return !state.fenced;
  }
  if (state.fenced) {
    return true;
  }
  for (const match of line.matchAll(WIKILINK)) {
    const from = state.offset + (match.index ?? 0);
    found.push({ from, to: from + match[0].length });
  }
  return false;
}

function item(
  text: string,
  message: string,
  from: number,
  to: number,
): DiagnosticItem {
  return {
    message,
    severity: "error",
    ...span(text, from, Math.max(from, to)),
  };
}
