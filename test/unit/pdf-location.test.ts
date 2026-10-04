import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatLocationFragment, parseLocationFragment, pdfLink } from '../../src/shared/pdf-location';

test('a location becomes an RFC 8118 fragment with readable commas', () => {
  assert.equal(
    formatLocationFragment({ page: 3, viewRect: { left: 72, top: 83.04, width: 134.12, height: 21 } }),
    'page=3&viewrect=72,83,134.1,21',
  );
  assert.equal(formatLocationFragment({ page: 12 }), 'page=12');
  assert.equal(
    pdfLink('papers/my paper.pdf', { page: 2 }),
    'papers/my paper.pdf#page=2',
  );
});

test('fragments parse back, including percent-encoded commas from other writers', () => {
  assert.deepEqual(parseLocationFragment('page=3&viewrect=72,83,134,21'), {
    page: 3,
    viewRect: { left: 72, top: 83, width: 134, height: 21 },
  });
  assert.deepEqual(parseLocationFragment('#page=3&viewrect=72%2C83%2C134%2C21'), {
    page: 3,
    viewRect: { left: 72, top: 83, width: 134, height: 21 },
  });
  assert.deepEqual(parseLocationFragment('zoom=200&page=4'), { page: 4 });
});

test('an invalid page rejects the fragment and an invalid box is dropped', () => {
  assert.equal(parseLocationFragment(''), undefined);
  assert.equal(parseLocationFragment('page=0'), undefined);
  assert.equal(parseLocationFragment('page=2.5'), undefined);
  assert.equal(parseLocationFragment('L12'), undefined);
  assert.deepEqual(parseLocationFragment('page=2&viewrect=1,2,0,4'), { page: 2 });
  assert.deepEqual(parseLocationFragment('page=2&viewrect=1,2,3'), { page: 2 });
});
