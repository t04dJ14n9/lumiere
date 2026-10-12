/**
 * Adversarial texts for the fuzz harness: long runs of the characters
 * Markdown and diff regexes care about, at 80k-110k characters, alone and
 * embedded where a changed segment or a table/list/fence line would put them.
 */
const N = 100_000;
const run = (s: string, n = N) => s.repeat(Math.ceil(n / s.length)).slice(0, n);

const runs: Record<string, string> = {
  spaces: " ",
  tabs: "\t",
  newlines: "\n",
  crlf: "\r\n",
  pipes: "|",
  dashes: "-",
  colons: ":",
  backticks: "`",
  tildes: "~",
  dollars: "$",
  hashes: "#",
  gt: ">",
  lt: "<",
  brackets: "[",
  closers: "]",
  caret: "[^",
  parens: "(",
  linkopen: "](",
  quotes: '"',
  squotes: "'",
  stars: "*",
  underscores: "_",
  letters: "x",
  digits: "9",
  urlish: "a:/",
  wordspace: "a ",
  pipespace: "| ",
  dashspace: "- ",
  indentlist: "  - ",
  bom: "\u00a0",
};

export const INPUTS: Record<string, string> = {};
for (const [name, unit] of Object.entries(runs)) {
  INPUTS[name] = run(unit);
  // Inside a changed segment: non-space on both sides of the run.
  INPUTS[`${name}-inner`] = `a${run(unit, N - 2)}b`;
}
Object.assign(INPUTS, {
  "indented-row": `${run(" ", 80_000)}| a |`,
  "fence-spaces": `${run("`", 40_000)}${run(" ", 40_000)}x`,
  "fence-tildes": `~~~\n${run("~", 40_000)}${run(" ", 40_000)}x`,
  "separator-spaces": `|${run(" ", 40_000)}|${run(" ", 40_000)}x`,
  "def-title": `[g]: /u\n"${run("a", 80_000)}`,
  "def-many": run("[g]:\n", N),
  "footnotes-open": run("[^a", N),
  "table-wide": `| a |\n| --- |\n| ${run("b ", 80_000)} |`,
  "table-cell-spaces": `| a |\n| --- |\n| a${run(" ", 80_000)}b |`,
  "list-deep": run("    ", 80_000) + "- x",
});
