/** Node diagnostics, not browser startup: node --import tsx scripts/measure-prism.ts */
import { prismFixture } from "../test/support/prism";

async function measure() {
  const eager = await prismFixture(false);
  const lazy = await prismFixture(true);
  const samples: { eagerMs: number; coreMs: number; typescriptMs: number }[] =
    [];
  for (let run = 0; run < 7; run++) {
    let started = performance.now();
    eager();
    const eagerMs = performance.now() - started;
    started = performance.now();
    const fixture = lazy();
    const coreMs = performance.now() - started;
    started = performance.now();
    await fixture.highlighter!.loadLanguage("ts");
    samples.push({
      eagerMs: Math.round(eagerMs * 100) / 100,
      coreMs: Math.round(coreMs * 100) / 100,
      typescriptMs: Math.round((performance.now() - started) * 100) / 100,
    });
  }
  const median = (key: keyof (typeof samples)[number]) =>
    samples.map((sample) => sample[key]).sort((a, b) => a - b)[3];
  console.log(
    JSON.stringify(
      {
        median: {
          eagerMs: median("eagerMs"),
          coreMs: median("coreMs"),
          typescriptMs: median("typescriptMs"),
        },
        samples,
      },
      null,
      2,
    ),
  );
}
void measure();
