/**
 * A long note for scroll measurements: sections of prose, each with a
 * Mermaid diagram (seven kinds in turn), and display math, tables, images,
 * callouts and code in between. Every diagram's labels name its section, so
 * no two sources are the same and no cache can hide a first render.
 * Deterministic, so runs compare.
 */

/** A small PNG as a data URL; the `|WxH` suffix in the embed sizes it. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALUlEQVR4nO3NMQkAAAwDsPo3vSkolED+5JKKzioWi8VisVgsFovFYrFYLB6NH6r1OhvW1o1iAAAAAElFTkSuQmCC";

const WORDS =
  "the editor scrolls a long note with diagrams math tables images and plain prose so frames should stay smooth while every block renders in place".split(
    " ",
  );

function prose(seed: number, words: number): string {
  const out: string[] = [];
  for (let index = 0; index < words; index++) {
    out.push(WORDS[(seed * 7 + index * 13) % WORDS.length]!);
  }
  out[0] = out[0]!.charAt(0).toUpperCase() + out[0]!.slice(1);
  return `${out.join(" ")}.`;
}

function flowchart(n: number): string {
  const lines = ["flowchart TB"];
  const nodes = 6 + (n % 6);
  for (let index = 0; index < nodes; index++) {
    lines.push(
      `  S${n}N${index}[Section ${n} step ${index}] --> S${n}N${index + 1}`,
    );
  }
  lines.push(`  S${n}N${nodes}{Done ${n}?} -->|yes| S${n}End((End))`);
  lines.push(`  S${n}N${nodes} -->|no| S${n}N0`);
  return lines.join("\n");
}

function sequence(n: number): string {
  const lines = ["sequenceDiagram"];
  for (let index = 0; index < 6 + (n % 4); index++) {
    const from = ["Editor", "Vault", "Host", "Agent"][index % 4];
    const to = ["Vault", "Host", "Agent", "Editor"][index % 4];
    lines.push(`  ${from}->>${to}: message ${index} of section ${n}`);
  }
  return lines.join("\n");
}

function classes(n: number): string {
  return [
    "classDiagram",
    `  class Note${n} {`,
    "    +String title",
    "    +String body",
    "    +render() void",
    "  }",
    `  class Diagram${n} {`,
    "    +String source",
    "    +draw() Svg",
    "  }",
    `  class Table${n}`,
    `  Note${n} "1" --> "*" Diagram${n} : holds`,
    `  Note${n} "1" --> "*" Table${n} : holds`,
  ].join("\n");
}

function states(n: number): string {
  return [
    "stateDiagram-v2",
    `  [*] --> Idle${n}`,
    `  Idle${n} --> Scrolling${n} : wheel`,
    `  Scrolling${n} --> Measuring${n} : frame`,
    `  Measuring${n} --> Scrolling${n} : more input`,
    `  Measuring${n} --> Idle${n} : settled`,
    `  Idle${n} --> [*]`,
  ].join("\n");
}

function entities(n: number): string {
  return [
    "erDiagram",
    `  NOTE${n} ||--o{ BLOCK${n} : contains`,
    `  BLOCK${n} ||--|{ LINE${n} : spans`,
    `  NOTE${n} }o--o{ TAG${n} : tagged`,
  ].join("\n");
}

function gantt(n: number): string {
  return [
    "gantt",
    `  title Plan for section ${n}`,
    "  dateFormat YYYY-MM-DD",
    "  section Build",
    `  Measure ${n} :a${n}, 2026-01-01, 3d`,
    `  Fix ${n} :after a${n}, 4d`,
    "  section Ship",
    `  Review ${n} :2026-01-09, 2d`,
  ].join("\n");
}

function pie(n: number): string {
  return [
    `pie title Time spent in section ${n}`,
    `  "Layout" : ${20 + (n % 7)}`,
    `  "Script" : ${30 + (n % 5)}`,
    `  "Paint" : ${10 + (n % 3)}`,
  ].join("\n");
}

const DIAGRAMS = [flowchart, sequence, classes, states, entities, gantt, pie];

/** The Mermaid source (without fences) of section `n`. */
export function diagramSource(n: number): string {
  return DIAGRAMS[n % DIAGRAMS.length]!(n);
}

function table(n: number): string {
  const rows = ["| Name | Kind | Count | Note |", "| --- | --- | ---: | --- |"];
  for (let index = 0; index < 5; index++) {
    rows.push(
      `| Row ${n}.${index} | ${WORDS[(n + index) % WORDS.length]} | ${n * 10 + index} | ${prose(n + index, 4)} |`,
    );
  }
  return rows.join("\n");
}

function section(n: number): string {
  const parts = [`## Section ${n}`, prose(n, 60), prose(n + 1, 45)];
  parts.push(`\`\`\`mermaid\n${diagramSource(n)}\n\`\`\``);
  parts.push(`${prose(n + 2, 30)} Inline math $e^{i\\pi} + ${n} = ${n - 1}$.`);
  if (n % 2 === 0) {
    parts.push(
      `$$\n\\begin{aligned}\nf_{${n}}(x) &= \\sum_{k=0}^{${n + 3}} \\frac{x^k}{k!} \\\\\ng(x) &= \\int_0^x f_{${n}}(t)\\,dt\n\\end{aligned}\n$$`,
    );
  }
  if (n % 3 === 0) {
    parts.push(table(n));
  }
  if (n % 4 === 1) {
    parts.push(`![figure ${n}|320x180](${PNG})`);
  }
  if (n % 5 === 2) {
    parts.push(`> [!note] Callout ${n}\n> ${prose(n + 3, 40)}`);
  }
  if (n % 3 === 1) {
    parts.push(
      `\`\`\`ts\nexport function section${n}(value: number): number {\n  return value * ${n};\n}\n\`\`\``,
    );
  }
  parts.push(
    `- ${prose(n + 4, 10)}\n- ${prose(n + 5, 12)}\n- [ ] task ${n}`,
    prose(n + 6, 50),
  );
  return parts.join("\n\n");
}

/** A note of `sections` sections, each with one Mermaid diagram. */
export function mermaidNote(sections: number): string {
  const parts = [`# Scroll test`];
  for (let n = 0; n < sections; n++) {
    parts.push(section(n));
  }
  return `${parts.join("\n\n")}\n`;
}

/** A note with no diagrams, for comparison: the same prose, math and tables. */
export function plainNote(sections: number): string {
  return mermaidNote(sections).replace(
    /```mermaid\n[\s\S]*?\n```/g,
    "Paragraph where a diagram would be.",
  );
}
