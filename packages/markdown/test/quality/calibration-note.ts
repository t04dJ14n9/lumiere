/**
 * The calibration note, shared by Node and the browser page so both time the
 * same work. About 200 KB of headings, prose, lists, tables and code.
 */
export function calibrationNote(): string {
  const parts: string[] = [];
  for (let section = 0; section < 120; section++) {
    parts.push(
      `## Section ${section}`,
      "",
      `Paragraph with **bold**, *italic*, \`code\`, a [link](https://example.com/${section}) and [[Note ${section}]].`.repeat(
        4,
      ),
      "",
      "- item one\n- item two\n  - nested\n- [ ] a task",
      "",
      "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
      "",
      "```ts\nconst value = 1;\nfunction twice(x: number) {\n  return x * 2;\n}\n```",
      "",
      "> A quote that runs on for a while, as quotes in notes do.",
      "",
    );
  }
  return parts.join("\n");
}

/** Fastest parse of the calibration note in Node on the reference machine (ms). */
export const REFERENCE_PARSE_MS = 8.5;
