/** A note of `blocks` blocks: headings, paragraphs with inline marks, lists, quotes and code. */
export function note(blocks: number): string {
  const parts: string[] = [];
  for (let index = 0; index < blocks; index++) {
    switch (index % 8) {
      case 0:
        parts.push(`## Section ${index}`);
        break;
      case 1:
      case 2:
        parts.push(
          `Paragraph ${index} with **bold**, *italic*, \`code\`, a [link](https://example.com/${index}) and [[Wikilink ${index}]].`,
        );
        break;
      case 3:
        parts.push(`- item ${index}\n- item ${index + 1}`);
        break;
      case 4:
        parts.push(`> quote ${index}`);
        break;
      case 5:
        parts.push("```ts\nconst value = 1;\n```");
        break;
      case 6:
        parts.push(`- [ ] task ${index}`);
        break;
      default:
        parts.push(`Plain paragraph ${index}.`);
    }
  }
  return `${parts.join("\n\n")}\n`;
}
