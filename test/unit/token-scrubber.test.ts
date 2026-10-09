import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenScrubber } from '../../src/extension/plugins/agentBridge/mcp/scrub';

test('the token is scrubbed in the forms an error message can quote it', () => {
  const token = 'ab/c+d=e f"g\\h0123';
  const scrub = tokenScrubber(token);
  const percentAll = [...token].map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
  const quoted = [
    token,
    `http://127.0.0.1:1/mcp/${token}`,
    encodeURIComponent(token),
    JSON.stringify(token).slice(1, -1),
    percentAll,
    percentAll.toUpperCase(),
    token.toUpperCase(),
  ];
  for (const form of quoted) {
    const text = scrub(`failed: ${form} (end)`);
    assert.equal(text.includes(form), false, form);
    assert.match(text, /<token>/);
  }
  assert.equal(scrub('nothing secret here'), 'nothing secret here');
});

test('a hex token is scrubbed in lower and upper case', () => {
  const token = 'deadbeef0123456789abcdef';
  const scrub = tokenScrubber(token);
  assert.equal(scrub(`${token} ${token.toUpperCase()}`), '<token> <token>');
});
