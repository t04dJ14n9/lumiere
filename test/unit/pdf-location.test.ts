import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatLocationFragment, parseLocationFragment, pdfLink } from '../../src/shared/pdf-location';

test('locations round-trip through RFC 8118 link fragments', () => {
  const location = { page: 3, viewRect: { left: 72, top: 83.04, width: 134.12, height: 21 } };
  assert.equal(formatLocationFragment(location), 'page=3&viewrect=72,83,134.1,21');
  assert.equal(pdfLink('papers/my paper.pdf', { page: 2 }), 'papers/my paper.pdf#page=2');
  assert.deepEqual(parseLocationFragment('#page=3&viewrect=72,83,134,21'), {
    page: 3,
    viewRect: { left: 72, top: 83, width: 134, height: 21 },
  });
  // Other writers percent-encode the commas; unknown parameters are ignored.
  assert.deepEqual(parseLocationFragment('zoom=200&page=3&viewrect=72%2C83%2C134%2C21'), parseLocationFragment('page=3&viewrect=72,83,134,21'));
});

test('an invalid page rejects the fragment and an invalid box is dropped', () => {
  for (const fragment of ['', 'page=0', 'page=2.5', 'L12']) assert.equal(parseLocationFragment(fragment), undefined);
  assert.deepEqual(parseLocationFragment('page=2&viewrect=1,2,0,4'), { page: 2 });
  assert.deepEqual(parseLocationFragment('page=2&viewrect=1,2,3'), { page: 2 });
});
