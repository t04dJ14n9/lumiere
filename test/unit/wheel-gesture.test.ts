import assert from "node:assert/strict";
import { test } from "node:test";
import { EdgeTurn, WheelGesture } from "../../src/shared/smooth-motion";

const pixel = (deltaY: number, deltaX = 0) => ({ deltaX, deltaY, deltaMode: 0 });

test("a mouse wheel's notches are discrete; a trackpad flick is native even when one delta looks like a notch", () => {
  const wheel = new WheelGesture();
  assert.equal(wheel.discrete(pixel(100), 0), true);
  assert.equal(wheel.discrete(pixel(120), 40), true);
  assert.equal(wheel.discrete({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 80), true);
  const flick = new WheelGesture();
  for (const [index, delta] of [2, 9, 30, 100, 200, 300, 140, 60, 12, 1].entries())
    assert.equal(flick.discrete(pixel(delta), 1_000 + index * 16), false, String(delta));
  // After a pause, the next gesture is judged anew.
  assert.equal(flick.discrete(pixel(100), 2_000), true);
  // A diagonal or fractional delta marks a trackpad.
  assert.equal(new WheelGesture().discrete(pixel(100, 4), 0), false);
  assert.equal(new WheelGesture().discrete(pixel(100.5), 0), false);
});

test("pushing against the edge turns one page per gesture, however long the momentum", () => {
  const turn = new EdgeTurn();
  let time = 0;
  const turns: number[] = [];
  // A flick: decaying deltas for 1.5 s.
  for (let delta = 120; delta >= 1; delta *= 0.97) turns.push(turn.push(delta, true, (time += 16)));
  assert.equal(turns.filter((value) => value === 1).length, 1);
  assert.equal(turns.filter((value) => value === -1).length, 0);
  // A new swipe after a pause turns again; so does reversing at once.
  assert.equal(turn.push(100, true, (time += 400)), 1);
  assert.equal(turn.push(-100, true, (time += 16)), -1);
});

test("deltas short of the threshold, away from the edge, or a swipe within momentum behave", () => {
  const turn = new EdgeTurn();
  assert.equal(turn.push(10, true, 0), 0);
  assert.equal(turn.push(10, false, 16), 0, "leaving the edge resets");
  assert.equal(turn.push(10, true, 32), 0);
  assert.equal(turn.push(60, true, 48), 1);
  assert.equal(turn.push(30, true, 64), 0, "momentum is ignored");
  assert.equal(turn.push(10, true, 80), 0);
  assert.equal(turn.push(80, true, 96), 1, "a new, harder swipe within the tail turns again");
});
