import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contributions } from "../../scripts/generate-contributions";
test("package contributions match the generator", async () => {
  assert.deepEqual(
    JSON.parse(readFileSync("package.json", "utf8")).contributes,
    await contributions(),
  );
});
test("the source ledger preserves the complete pinned inventory", () => {
  const ledger = readFileSync("docs/TEST_LEDGER.md", "utf8");
  for (const [tier, count] of [
    ["unit", 106],
    ["browser", 293],
    ["native", 47],
  ] as const) {
    assert.equal(
      ledger.split("\n").filter((line) => line.startsWith(`| \`${tier}/`)).length,
      count,
    );
  }
});
test('manifest surfaces match the host and webview registries', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const host = readFileSync('src/plugins/host.ts', 'utf8'), webview = readFileSync('src/plugins/webview.ts', 'utf8');
  for (const directory of readdirSync('src/plugins', { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const file = resolve('src/plugins', directory.name, 'manifest.ts'); if (!existsSync(file)) continue;
    const manifest = (await import(pathToFileURL(file).href)).default as { id: string; surfaces: string[] };
    for (const [surface, registry] of [['host', host], ['webview', webview]]) {
      assert.equal(registry!.includes(`./${manifest.id}/${surface}`), manifest.surfaces.includes(surface!), `${manifest.id}/${surface}`);
    }
  }
});
