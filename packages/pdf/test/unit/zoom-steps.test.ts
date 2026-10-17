import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZOOM_STEPS, nextZoomStep } from '../../src/shared/zoom-steps';

test('zoom steps go up and down through even levels, never jumping past a neighbour', () => {
  assert.equal(nextZoomStep(1, 1), 1.1);
  assert.equal(nextZoomStep(1, -1), 0.9);
  // A fitted zoom between steps moves to the nearest step in that direction.
  assert.equal(nextZoomStep(1.64, 1), 1.75);
  assert.equal(nextZoomStep(1.64, -1), 1.5);
  // Rounding noise does not count as being past a step.
  assert.equal(nextZoomStep(1.003, 1), 1.1);
  assert.equal(nextZoomStep(0.997, -1), 0.9);
  // The limits hold.
  assert.equal(nextZoomStep(4, 1), 4);
  assert.equal(nextZoomStep(0.25, -1), 0.25);
  for (let index = 1; index < ZOOM_STEPS.length; index++) {
    assert.ok(ZOOM_STEPS[index]! / ZOOM_STEPS[index - 1]! <= 1.55, `${ZOOM_STEPS[index - 1]} to ${ZOOM_STEPS[index]}`);
  }
});
