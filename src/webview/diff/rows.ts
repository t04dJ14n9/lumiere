/**
 * The rendered diff's rows. Blocks render one by one, so each also gets the
 * document-level context Markdown needs from elsewhere in its side: every
 * reference definition, and the definitions of footnotes it cites.
 * Definition blocks themselves render nothing, so they show as source lines.
 */
import { alignBlocks, lineBlockHtml, rowMarkdown } from "../../shared/diff";
import type { Block, BlockRow } from "../../shared/diff";
import { blockDefinitions, citations, definitions } from "./definitions";
import type { RenderOptions } from "../../markdown/html";
import type { PanelRow } from "./panel";

export { definitions } from "./definitions";

const isDefinitions = (block: Block) => definitions(block) !== undefined;

interface SideContext {
  readonly references: readonly string[];
  readonly footnotes: ReadonlyMap<string, string>;
}

function sideContext(blocks: readonly (Block | undefined)[]): SideContext {
  const references: string[] = [];
  const footnotes = new Map<string, string>();
  for (const block of blocks) {
    for (const definition of block ? blockDefinitions(block) : []) {
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
  const cited = citations(markdown);
  const notes = [...cited].flatMap((label) => {
    const text = context.footnotes.get(label);
    return text && !markdown.includes(`[^${label}]:`) ? [text] : [];
  });
  const extra = notes;
  return extra.length ? `${markdown}\n\n${extra.join("\n\n")}` : markdown;
}

function sideHtml(
  row: BlockRow,
  side: "before" | "after",
  context: SideContext,
  render: (markdown: string, options: RenderOptions) => string,
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
    : render(
        block.kind === "text" ? withContext(markdown, context) : markdown,
        {
          fragment: true,
          referenceDefinitions: context.references.join("\n"),
        },
      );
}

export function diffRows(
  before: string,
  after: string,
  render: (markdown: string, options: RenderOptions) => string,
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
