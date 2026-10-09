import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentText } from '../../src/shared/agent-text';

const source = { path: 'papers/attention_v2.pdf', sha256: 'ab'.repeat(32) };

test('a text selection copies its page link, file hash and text', () => {
  const text = agentText({
    kind: 'text',
    text: 'Scaled dot-product attention',
    pages: [{ page: 3, rects: [[72, 83, 150, 95], [72, 95, 206, 104]] }],
  }, source);
  assert.equal(text, [
    'Source: [papers/attention\\_v2.pdf (page 3)](<papers/attention_v2.pdf#page=3&viewrect=72,83,134,21>)',
    `PDF source SHA-256: \`${source.sha256}\``,
    '',
    'Selected text:',
    'Scaled dot-product attention',
    '',
    'When you answer, cite the Source link above so the reader can reopen this spot in the PDF.',
  ].join('\n'));
});

test('a selection across pages lists one link per page', () => {
  const text = agentText({
    kind: 'text',
    text: 'end of one page and start of the next',
    pages: [
      { page: 4, rects: [[72, 350, 200, 362]] },
      { page: 5, rects: [[72, 40, 180, 52]] },
    ],
  }, source);
  assert.match(text, /^Sources:\n- \[papers\/attention\\_v2\.pdf \(page 4\)\]\(<papers\/attention_v2\.pdf#page=4&viewrect=72,350,128,12>\)\n- \[papers\/attention\\_v2\.pdf \(page 5\)\]/);
  assert.match(text, /\n\nWhen you answer, cite the Source links above so the reader can reopen this spot in the PDF\.$/);
});

test('a region copies its box and asks the agent to inspect it', () => {
  const text = agentText({ kind: 'region', page: 7, rect: [150, 200, 250, 300] }, source);
  assert.equal(text.split('\n')[0], 'Source: [papers/attention\\_v2.pdf (page 7 region)](<papers/attention_v2.pdf#page=7&viewrect=150,200,100,100>)');
  assert.match(text, /\n\nSelected PDF region\. Read the text inside the view rectangle/);
});

test('a region adds its snapshot and the text inside it', () => {
  const text = agentText(
    { kind: 'region', page: 9, rect: [92, 126, 520, 387], text: 'N d_model\nbase 6 512' },
    source,
    { regionImage: '/storage/regions/p9.png' },
  );
  assert.equal(text.split('\n').slice(3).join('\n'), [
    'Selected PDF region. Read the text inside the view rectangle, or render that area of the page to inspect figures and tables.',
    'Region image: `/storage/regions/p9.png`',
    '',
    'Text in the region, line by line (table columns are not kept; see the image):',
    'N d_model',
    'base 6 512',
    '',
    'When you answer, cite the Source link above so the reader can reopen this spot in the PDF.',
  ].join('\n'));
  // Without a snapshot there is no image to point to.
  assert.match(agentText({ kind: 'region', page: 9, rect: [92, 126, 520, 387], text: 'x' }, source),
    /\nText in the region, line by line \(table columns are not kept\):\nx\n/);
});
