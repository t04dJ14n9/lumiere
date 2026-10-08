import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contributions } from '../../scripts/generate-contributions';
test('package contributions match the generator', () => {
  assert.deepEqual(JSON.parse(readFileSync('package.json', 'utf8')).contributes, contributions());
});
test('the source ledger preserves the complete pinned inventory', () => {
  const ledger = readFileSync('docs/TEST_LEDGER.md', 'utf8');
  for (const [tier, count] of [['unit', 106], ['browser', 293], ['native', 47]] as const) {
    assert.equal(ledger.split('\n').filter(line => line.startsWith(`| \`${tier}/`)).length, count);
  }
});
