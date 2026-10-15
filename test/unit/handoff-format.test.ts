import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { agentText } from '../../src/shared/agent-text';
import { notePayload, noteReference } from '../../src/shared/note-reference';
import type { PdfSelection } from '../../src/shared/selection';

/**
 * docs/agent-handoff-format.md and this fixture are byte-identical in
 * Markdown Workshop. If a hash changes, update both repositories together.
 */
const PINNED: Record<string, string> = {
  'test/fixtures/agent-handoff-format.json': '4db5869bc1ba8a58872c0ffddfc3e9c316ab717fb32d50b039ab032c76c22e72',
  'docs/agent-handoff-format.md': 'c2119f8b85867b2bc9a4c451bbb4915a4f3b22522c378f97e9872a7bd62fc4ec',
};

interface Fixture {
  noteReferences: { path: string; startLine: number; endLine: number; text: string }[];
  notePayloads: { reference: string; selection: string; text: string }[];
  pdfTexts: { selection: PdfSelection; source: { path: string; sha256: string }; text: string }[];
}

const fixture = JSON.parse(readFileSync('test/fixtures/agent-handoff-format.json', 'utf8')) as Fixture;

test('the shared handoff format files match the copies in Markdown Workshop', () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash, `${file} changed; update Markdown Workshop too`);
  }
});

test('note references and payloads follow the shared handoff format', () => {
  for (const { path, startLine, endLine, text } of fixture.noteReferences) {
    assert.equal(noteReference(path, startLine, endLine, false), text);
  }
  for (const { reference, selection, text } of fixture.notePayloads) {
    assert.equal(notePayload(reference, selection), text);
  }
});

test('PDF selections follow the shared handoff format', () => {
  for (const { selection, source, text } of fixture.pdfTexts) {
    assert.equal(agentText(selection, source), text);
  }
});
