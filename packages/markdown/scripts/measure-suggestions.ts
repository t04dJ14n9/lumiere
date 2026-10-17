/** Generated data only; never reads an owner's vault. Run with `pnpm exec tsx scripts/measure-suggestions.ts`. */
import { performance } from "node:perf_hooks";
import { MemoryVaultIndex } from "../src/plugins/vault/memory-index";
import { metadata } from "../src/markdown/metadata";
import { SuggestionIndex } from "../src/plugins/suggest/sources";
import type { Query } from "../src/plugins/suggest/protocol";
const count = Number(process.argv[2] ?? 10000);
const vault = new MemoryVaultIndex({
  root: "memory:///vault",
  folderNote: "",
  linkFormat: "shortest",
});
for (let n = 0; n < count; n++) {
  const path = `folder${n % 10}/Note ${n}.md`;
  const text = `---\naliases: [Alias ${n}]\npriority: 3\n---\n# Section 1\n## Section 2\n### Section 3\n#### Section 4\n\nA searchable body ${n} ^block\n\n#project/notes`;
  vault.upsertFile({
    path,
    uri: `${vault.root}/${path}`,
    mtime: 0,
    size: text.length,
  });
  vault.setMetadata(path, metadata(text));
}
const cache = new SuggestionIndex(vault);
const stop = vault.onDidChange((change) => cache.invalidate(change));
const queries: Query[] = [
  { kind: "link", query: "Note" },
  { kind: "link", query: "note 123" },
  { kind: "link", query: "" },
  { kind: "heading", query: "Section" },
  { kind: "block", query: "body" },
  { kind: "tag", query: "project" },
];
console.log(`Generated ${count} notes; 4 headings, 1 block, 1 alias each.`);
for (const query of queries) {
  const coldStart = performance.now();
  cache.query("folder0/Note 0.md", query);
  const cold = performance.now() - coldStart;
  const samples = Array.from({ length: 25 }, () => {
    const start = performance.now();
    cache.query("folder0/Note 0.md", query);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  console.log(
    `${query.kind} ${JSON.stringify(query.query)}: cold ${cold.toFixed(2)} ms; warm median ${samples[12]!.toFixed(2)} ms; p95 ${samples[23]!.toFixed(2)} ms`,
  );
}
const changeStart = performance.now();
vault.setMetadata(
  "folder0/Note 0.md",
  metadata("# New heading\n\nNew body ^new\n\n#newtag"),
);
for (const query of queries) {
  const start = performance.now();
  cache.query("folder0/Note 0.md", query);
  console.log(
    `After change ${query.kind} ${JSON.stringify(query.query)}: ${(performance.now() - start).toFixed(2)} ms`,
  );
}
console.log(
  `One changed file + all six queries: ${(performance.now() - changeStart).toFixed(2)} ms`,
);
void stop();
