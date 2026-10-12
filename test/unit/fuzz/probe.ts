/**
 * Child-process half of the fuzz harness. argv: <target file> <target name>.
 * Runs the target on every input (and on each input paired with a small
 * baseline, both ways, for two-text targets), printing one JSON line per
 * case *before* it starts and one after, so the parent can name a case that
 * stalled when it has to kill this process.
 */
import { INPUTS } from "./inputs";
import type { Target } from "./target";

async function main(): Promise<void> {
  const [file, name] = process.argv.slice(2);
  const loaded = (await import(file!)) as { targets: Record<string, Target> };
  const target = loaded.targets[name!]!;
  for (const [input, text] of Object.entries(INPUTS)) {
    const cases: [string, () => unknown][] =
      target.arity === 1
        ? [[input, () => target.run(text, "")]]
        : [
            [`${input}/old→adv`, () => target.run("prose old\n", text)],
            [`${input}/adv→old`, () => target.run(text, "prose old\n")],
            [`${input}/adv→adv+`, () => target.run(text, `${text} new`)],
          ];
    for (const [label, go] of cases) {
      process.stdout.write(`${JSON.stringify({ start: label })}\n`);
      const started = performance.now();
      go();
      const ms = performance.now() - started;
      process.stdout.write(`${JSON.stringify({ done: label, ms })}\n`);
    }
  }
}

void main();
