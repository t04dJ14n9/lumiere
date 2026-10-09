import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { agentText } from '../../src/shared/agent-text';
import { notePayload, noteReference } from '../../src/shared/note-reference';
import type { PdfSelection } from '../../src/shared/selection';

/**
 * docs/agent-handoff-format.md and this fixture are byte-identical in
 * Markdown Workbench. If a hash changes, update both repositories together.
 */
const PINNED: Record<string, string> = {
  'test/fixtures/agent-handoff-format.json': '9d29aaed6ffc09359ffccbefc254f7f5542ed7cd2fc8de1970632595471f52c3',
  'docs/agent-handoff-format.md': '4422afadf038d3904f755be844abf94f39381f4a7f25d05dd3db93b5edd56e25',
};

interface Fixture {
  noteReferences: { path: string; startLine: number; endLine: number; text: string }[];
  notePayloads: { reference: string; selection: string; text: string }[];
  pdfTexts: { selection: PdfSelection; source: { path: string; sha256: string }; text: string }[];
}

const fixture = JSON.parse(readFileSync('test/fixtures/agent-handoff-format.json', 'utf8')) as Fixture;

test('the shared handoff format files match the copies in Markdown Workbench', () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash, `${file} changed; update Markdown Workbench too`);
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
