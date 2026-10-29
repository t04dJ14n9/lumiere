import test from "node:test";
import assert from "node:assert/strict";
import {
  canPanToward,
  followDiagonalWheel,
  isMostlyVerticalDiagonal,
} from "./diagonal-wheel";

const plain = {
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

function wheel(overrides: Partial<WheelEvent>): Event {
  return Object.assign(new Event("wheel"), { ...plain, ...overrides });
}

function wideTable() {
  const scrolls: number[] = [];
  const table = Object.assign(new EventTarget(), {
    scrollLeft: 0,
    scrollWidth: 2000,
    clientWidth: 800,
  });
  const events = new AbortController();
  followDiagonalWheel(
    table as unknown as HTMLElement,
    () => ({
      scrollBy: (options?: ScrollToOptions | number) =>
        scrolls.push((options as ScrollToOptions).top!),
    }),
    events.signal,
  );
  return { table, scrolls, events };
}

test("only a sideways-leaning vertical pixel wheel counts as a diagonal", () => {
  assert.equal(isMostlyVerticalDiagonal({ ...plain, deltaY: 120 }), false);
  assert.equal(
    isMostlyVerticalDiagonal({ ...plain, deltaX: 30, deltaY: 120 }),
    true,
  );
  assert.equal(
    isMostlyVerticalDiagonal({ ...plain, deltaX: -30, deltaY: -120 }),
    true,
  );
  assert.equal(
    isMostlyVerticalDiagonal({ ...plain, deltaX: 120, deltaY: 120 }),
    false,
  );
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey"] as const) {
    assert.equal(
      isMostlyVerticalDiagonal({
        ...plain,
        deltaX: 30,
        deltaY: 120,
        [modifier]: true,
      }),
      false,
    );
  }
  assert.equal(
    isMostlyVerticalDiagonal({ ...plain, deltaX: 1, deltaY: 3, deltaMode: 1 }),
    false,
  );
});

test("the table can pan only toward a side it has not reached", () => {
  const table = { scrollLeft: 0, scrollWidth: 2000, clientWidth: 800 };
  assert.equal(canPanToward(table, 30), true);
  assert.equal(canPanToward(table, -30), false);
  table.scrollLeft = 1200;
  assert.equal(canPanToward(table, 30), false);
  assert.equal(canPanToward(table, -30), true);
  assert.equal(canPanToward(table, 0), false);
});

test("the note takes a diagonal's vertical part once the table pans for it", () => {
  const { table, scrolls, events } = wideTable();
  table.dispatchEvent(wheel({ deltaX: 30, deltaY: 120 }));
  table.dispatchEvent(wheel({ deltaX: 10, deltaY: 40 }));
  assert.deepEqual(scrolls, [], "nothing moves before the table pans");
  table.dispatchEvent(new Event("scroll"));
  assert.deepEqual(scrolls, [160]);
  table.dispatchEvent(new Event("scroll"));
  assert.deepEqual(scrolls, [160], "a pan adds each vertical part once");
  events.abort();
  table.dispatchEvent(wheel({ deltaX: 30, deltaY: 120 }));
  table.dispatchEvent(new Event("scroll"));
  assert.deepEqual(scrolls, [160]);
});

test("a diagonal the note took itself adds nothing to a later pan", () => {
  const { table, scrolls } = wideTable();
  table.scrollLeft = 1200;
  table.dispatchEvent(wheel({ deltaX: 30, deltaY: 120 }));
  table.dispatchEvent(new Event("scroll"));
  assert.deepEqual(scrolls, [], "at the right edge the note latched itself");
  table.scrollLeft = 600;
  table.dispatchEvent(wheel({ deltaX: 30, deltaY: 120 }));
  table.dispatchEvent(wheel({ deltaX: 120, deltaY: 10 }));
  table.dispatchEvent(new Event("scroll"));
  assert.deepEqual(scrolls, [], "a horizontal wheel drops the vertical part");
});
