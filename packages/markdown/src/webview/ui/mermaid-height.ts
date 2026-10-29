/**
 * How tall a Mermaid diagram will draw, guessed from its source before
 * Mermaid runs. Its block reserves this until the SVG arrives, so the nearer
 * the guess, the less the note moves when a diagram draws on screen (and the
 * steadier the scrollbar over diagrams not drawn yet). Once a diagram has
 * drawn, its measured height replaces the guess (markdown-block-height.ts).
 *
 * The figures are Mermaid's default layout as measured in the editor: a
 * flowchart rank is about 105 px, a sequence message 52 px, a gantt task
 * 32 px; a pie is 450 px whatever its slices. They were checked against
 * test/support/mermaid-note.ts and mermaid-samples.ts, drawn at 731 and
 * 1211 px. Diagrams wider than the note
 * scale down to fit, and so does their height.
 */

/** The SVG's top and bottom padding inside the block. */
const BLOCK_CHROME = 54;
/** When no editor has reported its width yet. */
const FALLBACK_WIDTH = 700;
const NODE_ID = /^[A-Za-z_][\w-]*|^\[\*\]/u;

interface Diagram {
  /** The first statement, lowercased: `flowchart lr`, `sequencediagram`. */
  header: string;
  statements: string[];
}

/** The statements between the fences, without comments, directives or front matter. */
function parse(source: string): Diagram {
  const lines = source.split("\n").slice(1);
  if (/^\s*(`{3,}|~{3,})\s*$/u.test(lines.at(-1) ?? "")) {
    lines.pop();
  }
  let statements = lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  if (statements[0] === "---") {
    const end = statements.indexOf("---", 1);
    statements = statements.slice(end < 0 ? 1 : end + 1);
  }
  return {
    header: (statements[0] ?? "").toLowerCase(),
    statements: statements.slice(1),
  };
}

/** The node ids an edge statement joins, in order (`A[x] --> B --> C`). */
function edgeNodes(statement: string, arrow: RegExp): string[] {
  const parts = statement.split(arrow);
  if (parts.length < 2) {
    return [];
  }
  return parts
    .map((part) => part.replace(/^\|[^|]*\|/u, "").trim())
    .map((part) => NODE_ID.exec(part)?.[0] ?? "")
    .filter(Boolean);
}

/** Enough for any diagram a person writes; past it, the guess stops refining. */
const MAX_VISITS = 10_000;

/**
 * Layers of a graph ranked by longest path from its first nodes, as
 * Mermaid's layered layout ranks it: how many, and the most nodes in one.
 * An edge back to a node on the current path closes a cycle; Mermaid's
 * layout turns that edge around, so it does not deepen the ranks here.
 */
function layers(edges: [string, string][]): { count: number; widest: number } {
  const next = new Map<string, string[]>();
  for (const [from, to] of edges) {
    next.set(from, [...(next.get(from) ?? []), to]);
    next.set(to, next.get(to) ?? []);
  }
  const rank = new Map<string, number>();
  const onPath = new Set<string>();
  let visits = 0;
  const place = (node: string, depth: number): void => {
    if (onPath.has(node) || (rank.get(node) ?? 0) >= depth) {
      return;
    }
    if (++visits > MAX_VISITS) {
      return;
    }
    rank.set(node, depth);
    onPath.add(node);
    for (const to of next.get(node)!) {
      place(to, depth + 1);
    }
    onPath.delete(node);
  };
  for (const node of next.keys()) {
    if (!rank.has(node)) {
      place(node, 1);
    }
  }
  const perLayer = new Map<number, number>();
  for (const layer of rank.values()) {
    perLayer.set(layer, (perLayer.get(layer) ?? 0) + 1);
  }
  return {
    count: Math.max(1, ...perLayer.keys()),
    widest: Math.max(1, ...perLayer.values()),
  };
}

function graphEdges(statements: string[], arrow: RegExp): [string, string][] {
  const edges: [string, string][] = [];
  for (const statement of statements) {
    const ids = edgeNodes(statement, arrow);
    for (let index = 1; index < ids.length; index++) {
      edges.push([ids[index - 1]!, ids[index]!]);
    }
  }
  return edges;
}

/** Scale a diagram that is wider than the note down to fit it. */
function fitted(height: number, naturalWidth: number, width: number): number {
  return height * Math.min(1, width / naturalWidth);
}

const FLOW_ARROW = /\s*(?:<?[-=.]{2,}[->ox]?|~~~)(?:\|[^|]*\|)?\s*/u;

function flowchart(diagram: Diagram, width: number): number {
  const direction = diagram.header.split(/\s+/u)[1] ?? "tb";
  const { count, widest } = layers(graphEdges(diagram.statements, FLOW_ARROW));
  const subgraphs = diagram.statements.filter((line) =>
    line.startsWith("subgraph"),
  ).length;
  if (direction === "lr" || direction === "rl") {
    return fitted(40 + widest * 75 + subgraphs * 90, count * 170, width);
  }
  return fitted(count * 105 + subgraphs * 90, widest * 120, width);
}

const SEQUENCE_ARROW = /-{1,2}(?:>>|>|x|\))[+-]?/u;
const SEQUENCE_BLOCK = /^(?:loop|alt|opt|par|critical|break|rect)\b/iu;

function sequence(diagram: Diagram, width: number): number {
  const actors = new Set<string>();
  let height = 170;
  for (const line of diagram.statements) {
    const declared = /^(?:participant|actor)\s+(\S+)/iu.exec(line);
    if (declared) {
      actors.add(declared[1]!);
    } else if (/^note\s/iu.test(line)) {
      height += 70 + 25 * (line.split(/<br\s*\/?>/iu).length - 1);
    } else if (SEQUENCE_BLOCK.test(line)) {
      height += 70;
    } else if (/^(?:else|and)\b/iu.test(line)) {
      height += 40;
    } else if (/^[^:]*?-{1,2}(?:>>|>|x|\))/u.test(line)) {
      const [from, to] = line.split(SEQUENCE_ARROW);
      const target = (to ?? "").split(":")[0]!.trim();
      actors.add(from!.trim()).add(target);
      // A message to oneself loops back below its line.
      height += from!.trim() === target ? 92 : 52;
    }
  }
  return fitted(height, Math.max(1, actors.size) * 240, width);
}

const GANTT_KEYWORDS =
  /^(?:title|dateformat|axisformat|tickinterval|section|excludes|includes|todaymarker|weekday|inclusiveenddates|displaymode)\b/iu;

function gantt(diagram: Diagram): number {
  const tasks = diagram.statements.filter(
    (line) => line.includes(":") && !GANTT_KEYWORDS.test(line),
  ).length;
  const title = diagram.statements.some((line) => /^title\b/iu.test(line));
  return 50 + (title ? 25 : 0) + tasks * 32;
}

function states(diagram: Diagram): number {
  const edges = graphEdges(
    diagram.statements.map((line) => line.split(":")[0]!),
    /\s*-->\s*/u,
  ).map(([from, to]): [string, string] => [
    // `[*]` is a start before an arrow and an end after one: two nodes.
    from === "[*]" ? "[*] start" : from,
    to === "[*]" ? "[*] end" : to,
  ]);
  const nodes = new Set(edges.flat());
  return Math.max(2, nodes.size) * 72;
}

function classes(diagram: Diagram): number {
  const relation =
    /\s*(?:"[^"]*"\s*)?(?:<\|?|\*|o)?(?:--|\.\.)(?:\|?>|\*|o)?(?:\s*"[^"]*")?\s*/u;
  const edges = graphEdges(
    diagram.statements.filter((line) => !line.startsWith("class ")),
    relation,
  );
  let members = 0;
  let largest = 0;
  for (const line of diagram.statements) {
    if (line.startsWith("class ")) {
      members = 0;
    } else if (line !== "}" && !relation.test(line)) {
      members++;
      largest = Math.max(largest, members);
    }
  }
  return layers(edges).count * (130 + largest * 24);
}

function entities(diagram: Diagram): number {
  const relation = /\s*[|}o][|o]?(?:--|\.\.)[|o]?[|{o]\s*/u;
  const edges = graphEdges(
    diagram.statements.map((line) => line.split(":")[0]!),
    relation,
  );
  return layers(edges).count * 153;
}

/** The block height a Mermaid fence will draw at, guessed from its source. */
export function mermaidBlockHeight(source: string, widthPx = 0): number {
  const diagram = parse(source);
  const width = widthPx > 0 ? widthPx : FALLBACK_WIDTH;
  const kind = diagram.header.split(/\s+/u)[0] ?? "";
  let svg: number;
  if (kind === "flowchart" || kind === "graph") {
    svg = flowchart(diagram, width);
  } else if (kind === "sequencediagram") {
    svg = sequence(diagram, width);
  } else if (kind === "gantt") {
    svg = gantt(diagram);
  } else if (kind === "pie") {
    svg = 450;
  } else if (kind.startsWith("statediagram")) {
    svg = states(diagram);
  } else if (kind === "classdiagram") {
    svg = classes(diagram);
  } else if (kind === "erdiagram") {
    svg = entities(diagram);
  } else {
    // Other kinds: a tall-ish box per source line, as before.
    svg = Math.max(266, (diagram.statements.length + 1) * 72);
  }
  return Math.round(Math.max(120, svg) + BLOCK_CHROME);
}
