/**
 * The rendered diff's rows. Blocks render one by one, so each also gets the
 * document-level context Markdown needs from elsewhere in its side: every
 * reference definition, and the definitions of footnotes it cites.
 * Definition blocks themselves render nothing, so they show as source lines.
 */
import { alignBlocks, lineBlockHtml, rowMarkdown } from "../../shared/diff";
import type { Block, BlockRow } from "../../shared/diff";
import type { PanelRow } from "./panel";

const REFERENCE_START = /^ {0,3}\[(?!\^)([^\]\n]+)\]:(.*)$/;
const FOOTNOTE_START = /^ {0,3}\[\^([^\]\n]+)\]:/;
const TITLE = /^\s*["'(]/;
const CITATION = /\[\^([^\]\n]+)\](?!:)/g;

interface Definition {
  readonly kind: "reference" | "footnote";
  readonly label: string;
  readonly text: string;
}

/**
 * The reference and footnote definitions a block consists of, each with its
 * whole source: a reference's destination may sit on the next line and a
 * title on the one after; a footnote runs until the next definition.
 * Undefined when the block is not made only of definitions (a definition
 * cannot interrupt a paragraph).
 */
export function definitions(block: Block): Definition[] | undefined {
  const { found, complete } = leadingDefinitions(block);
  return complete ? found : undefined;
}

/**
 * The definitions at the start of a block (a paragraph may follow them),
 * and whether they are the whole block.
 */
function leadingDefinitions(block: Block): {
  found: Definition[];
  complete: boolean;
} {
  if (block.kind !== "text") {
    return { found: [], complete: false };
  }
  const lines = block.text.split("\n");
  const out: Definition[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const reference = REFERENCE_START.exec(line);
    const footnote = reference ? null : FOOTNOTE_START.exec(line);
    if (!reference && !footnote) {
      return { found: out, complete: false };
    }
    const end = reference
      ? referenceEnd(lines, i, reference[2]!)
      : footnoteEnd(lines, i);
    out.push({
      kind: reference ? "reference" : "footnote",
      label: (reference ?? footnote)![1]!,
      text: lines.slice(i, end).join("\n"),
    });
    i = end;
  }
  return { found: out, complete: out.length > 0 };
}

/** Past a reference definition: its destination line and title line. */
function referenceEnd(lines: string[], i: number, rest: string): number {
  let end = i + 1;
  if (rest.trim() === "" && end < lines.length) {
    end++; // the destination on its own line
  }
  if (end < lines.length && TITLE.test(lines[end]!) && !isStart(lines[end]!)) {
    end++; // a title on the next line
  }
  return end;
}

/** A footnote runs until the next definition. */
function footnoteEnd(lines: string[], i: number): number {
  let end = i + 1;
  while (end < lines.length && !isStart(lines[end]!)) {
    end++;
  }
  return end;
}

const isStart = (line: string) =>
  REFERENCE_START.test(line) || FOOTNOTE_START.test(line);

const isDefinitions = (block: Block) => definitions(block) !== undefined;

interface SideContext {
  readonly references: readonly string[];
  readonly footnotes: ReadonlyMap<string, string>;
}

function sideContext(blocks: readonly (Block | undefined)[]): SideContext {
  const references: string[] = [];
  const footnotes = new Map<string, string>();
  for (const block of blocks) {
    for (const definition of block ? leadingDefinitions(block).found : []) {
      if (definition.kind === "reference") {
        references.push(definition.text);
      } else {
        footnotes.set(definition.label, definition.text);
      }
    }
  }
  return { references, footnotes };
}

/** A block's Markdown with the definitions it uses from other blocks. */
function withContext(markdown: string, context: SideContext): string {
  const cited = new Set(
    [...markdown.matchAll(CITATION)].map((match) => match[1]!),
  );
  const notes = [...cited].flatMap((label) => {
    const text = context.footnotes.get(label);
    return text && !markdown.includes(`[^${label}]:`) ? [text] : [];
  });
  const extra = [...notes, context.references.join("\n")].filter(Boolean);
  return extra.length ? `${markdown}\n\n${extra.join("\n\n")}` : markdown;
}

function sideHtml(
  row: BlockRow,
  side: "before" | "after",
  context: SideContext,
  render: (markdown: string) => string,
): string | undefined {
  const block = row[side];
  if (!block) {
    return undefined;
  }
  if (isDefinitions(block)) {
    // Our own markup around escaped source; it needs no Markdown pass.
    return lineBlockHtml(row.before?.text, row.after?.text, side, "text");
  }
  const markdown = rowMarkdown(row)[side];
  return markdown === undefined
    ? undefined
    : render(withContext(markdown, context));
}

export function diffRows(
  before: string,
  after: string,
  render: (markdown: string) => string,
): PanelRow[] {
  const rows = alignBlocks(before, after, { containers: true });
  const left = sideContext(rows.map((row) => row.before));
  const right = sideContext(rows.map((row) => row.after));
  return rows.map((row) => {
    const a = sideHtml(row, "before", left, render);
    const b = sideHtml(row, "after", right, render);
    return {
      kind: row.kind,
      ...(a !== undefined && { before: a }),
      ...(b !== undefined && { after: b }),
    };
  });
}
