import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteReference } from '../../src/shared/note-reference';

test('a saved note gets the @path#lines reference Markdown Workbench writes', () => {
  assert.equal(noteReference('notes/a.md', 12, 18, false), '@notes/a.md#12-18');
  assert.equal(noteReference('notes/a.md', 4, 4, false), '@notes/a.md#4');
  assert.equal(noteReference('file:///elsewhere/b.md', 1, 2, false), '@file:///elsewhere/b.md#1-2');
});

test('an unsaved note has no stable lines, so it is named as unsaved', () => {
  assert.equal(noteReference('notes/a.md', 12, 18, true), 'notes/a.md (unsaved, lines 12-18)');
});
