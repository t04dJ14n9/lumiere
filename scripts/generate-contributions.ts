import { readFileSync, writeFileSync } from 'node:fs';
// Phase 0 has no capability manifests yet. Phase 3 registers the editor.
export function contributions() { return {}; }
if (process.argv[1]?.endsWith('generate-contributions.ts')) {
const path = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(path, 'utf8'));
if (process.argv.includes('--check')) {
  if (JSON.stringify(pkg.contributes) !== JSON.stringify(contributions())) throw new Error('Run pnpm contributions');
} else {
  pkg.contributes = contributions();
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
}
}
