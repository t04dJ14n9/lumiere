/**
 * Load times in a real VS Code: choosing a PDF to its first rendered page,
 * with the milestones the viewer marks (pdf:*), the extension's activation
 * time and the size of what the viewer loads. Writes perf.json under the
 * test profile (or PERF_OUT) and prints it; not part of the normal run
 * (PERF=1 enables it).
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { paths } from './state';
import { closeAllEditors, expect, openFile, pdfViewer, test } from './workbench';

interface Sample {
  /** From choosing the file to each milestone, in ms. */
  scriptStartMs: number;
  bufferMs: number;
  engineMs: number;
  openedMs: number;
  firstPageMs: number;
  heapMb: number;
  resources: { name: string; kb: number; ms: number }[];
}

test.skip(!process.env.PERF, 'Set PERF=1 to measure load times');

function activation(): string {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/PDF Workshop\.log$/.test(entry)) found.push(full);
    }
  };
  walk(path.join(paths.userData, 'logs'));
  const line = found.flatMap(file => readFileSync(file, 'utf8').split('\n')).find(text => text.includes('Activated in'));
  return line?.replace(/^.*Activated in /, '') ?? 'n/a';
}

test('load time: a small and a 600-page PDF', async ({ workbench: page }) => {
  test.setTimeout(240_000);
  const docs = path.join(paths.workspace, 'docs');
  mkdirSync(docs, { recursive: true });
  copyFileSync(path.join(paths.fixtures, 'large.pdf'), path.join(docs, 'large.pdf'));
  const results: Record<string, Sample> = {};
  for (const [label, file] of [['small (12 pages), cold', 'docs/outline.pdf'], ['600 pages', 'docs/large.pdf']] as const) {
    await closeAllEditors(page);
    const timing: { start?: number } = {};
    await openFile(page, file, timing);
    const viewer = await pdfViewer(page);
    await expect.poll(() => viewer.evaluate(() => performance.getEntriesByName('pdf:first-page').length), { timeout: 60_000 }).toBeGreaterThan(0);
    const marks = await viewer.evaluate(() => {
      const at = (name: string) => performance.timeOrigin + (performance.getEntriesByName(name)[0]?.startTime ?? NaN);
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        main: at('pdf:main'), buffer: at('pdf:buffer'), engine: at('pdf:engine'), opened: at('pdf:opened'), first: at('pdf:first-page'),
        heap: (memory?.usedJSHeapSize ?? 0) / 1048576,
        resources: performance.getEntriesByType('resource')
          .filter(entry => /\.(js|wasm|css)(\?|$)/.test(entry.name))
          .map(entry => ({ name: entry.name.split('/').pop()!.split('?')[0]!, kb: Math.round(((entry as PerformanceResourceTiming).encodedBodySize || 0) / 1024), ms: Math.round(entry.duration) })),
      };
    });
    const start = timing.start!;
    results[label] = {
      scriptStartMs: Math.round(marks.main - start),
      bufferMs: Math.round(marks.buffer - start),
      engineMs: Math.round(marks.engine - start),
      openedMs: Math.round(marks.opened - start),
      firstPageMs: Math.round(marks.first - start),
      heapMb: Math.round(marks.heap),
      resources: marks.resources,
    };
  }
  const dist = path.join(paths.repository, 'dist');
  const size = (name: string) => statSync(path.join(dist, name)).size;
  const report = {
    activation: activation(),
    bundles: { extensionJs: size('extension.js'), viewerJs: size('webview/viewer.js'), pdfiumWasm: size('webview/pdfium.wasm'), viewerCss: size('webview/viewer.css') },
    results,
  };
  console.log(`PERF ${JSON.stringify(report, null, 1)}`);
  writeFileSync(process.env.PERF_OUT ?? path.join(paths.root, 'perf.json'), JSON.stringify(report, null, 2));
});
