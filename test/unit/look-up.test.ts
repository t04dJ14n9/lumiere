import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreWord, isLookUpWord, lookUpEnabled, lookUpUrl, wordGlyphRange, type WordGlyph } from '../../src/shared/look-up';

/** A line of text as glyphs, 10 points wide each, from the given left edge. */
function line(text: string, left = 0, top = 0): WordGlyph[] {
  return [...text].map((char, index) => ({
    isSpace: char === ' ',
    box: [left + index * 10, top, left + index * 10 + 10, top + 12],
  }));
}

test('the word under a glyph runs to the nearest spaces', () => {
  const glyphs = line('read the  paper now');
  assert.deepEqual(wordGlyphRange(glyphs, 5), [5, 8]);
  assert.deepEqual(wordGlyphRange(glyphs, 0), [0, 4]);
  assert.deepEqual(wordGlyphRange(glyphs, 18), [16, 19]);
  assert.equal(wordGlyphRange(glyphs, 4), undefined, 'a space is no word');
  assert.equal(wordGlyphRange(glyphs, 99), undefined);
  assert.equal(wordGlyphRange([undefined, { isSpace: false }], 1), undefined, 'no box');
});

test('a word does not run across lines or a wide gap', () => {
  const twoLines = [...line('end', 0, 0), ...line('next', 0, 20)];
  assert.deepEqual(wordGlyphRange(twoLines, 1), [0, 3]);
  assert.deepEqual(wordGlyphRange(twoLines, 4), [3, 7]);
  const columns = [...line('left', 0), ...line('right', 200)];
  assert.deepEqual(wordGlyphRange(columns, 1), [0, 4]);
  assert.deepEqual(wordGlyphRange(columns, 6), [4, 9]);
});

test('punctuation around a word is dropped, inside it stays', () => {
  assert.equal(coreWord('“Attention,”'), 'Attention');
  assert.equal(coreWord('(don’t)'), 'don’t');
  assert.equal(coreWord('state-of-the-art.'), 'state-of-the-art');
  assert.equal(coreWord('naïve'), 'naïve');
  assert.equal(coreWord('注意力,'), '注意力');
  assert.equal(coreWord('3.14'), '3.14');
  assert.equal(coreWord('—'), '');
  assert.equal(coreWord('x'.repeat(101)), '');
});

test('only a single plain word is accepted from the viewer', () => {
  assert.ok(isLookUpWord('attention'));
  assert.ok(!isLookUpWord(''));
  assert.ok(!isLookUpWord('two\nlines'));
  assert.ok(!isLookUpWord('x'.repeat(101)));
  assert.ok(!isLookUpWord(42));
});

test('the Dictionary URL escapes the word', () => {
  assert.equal(lookUpUrl('attention'), 'dict://attention');
  assert.equal(lookUpUrl('a b/c?d'), 'dict://a%20b%2Fc%3Fd');
});

test('Look Up is for macOS with the setting on', () => {
  assert.ok(lookUpEnabled('darwin', true));
  assert.ok(!lookUpEnabled('darwin', false));
  assert.ok(!lookUpEnabled('linux', true));
  assert.ok(!lookUpEnabled('win32', true));
});
