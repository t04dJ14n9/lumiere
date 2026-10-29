/**
 * Write a disposable vault for feeling scroll smoothness by hand: long notes
 * with a Mermaid diagram in every section, and math, tables, images and
 * callouts between them (the notes `pnpm measure:scroll` scrolls).
 *
 * Usage: tsx scripts/scroll-vault.ts <empty folder> [sections=40]
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mermaidNote, plainNote } from "../test/support/mermaid-note";

const folder = process.argv[2];
const sections = Number(process.argv[3] ?? 40);
if (!folder) {
  console.error("Usage: tsx scripts/scroll-vault.ts <empty folder> [sections]");
  process.exit(1);
}
if (existsSync(folder) && readdirSync(folder).length > 0) {
  console.error(`${folder} is not empty; pick a new folder.`);
  process.exit(1);
}
mkdirSync(path.join(folder, ".obsidian"), { recursive: true });
const notes: Record<string, string> = {
  "Mermaid scroll.md": mermaidNote(sections),
  "Mermaid scroll (short).md": mermaidNote(Math.ceil(sections / 4)),
  "Plain scroll.md": plainNote(sections),
};
for (const [name, text] of Object.entries(notes)) {
  writeFileSync(path.join(folder, name), text);
}
console.log(
  `Wrote ${Object.keys(notes).length} notes to ${path.resolve(folder)}`,
);
