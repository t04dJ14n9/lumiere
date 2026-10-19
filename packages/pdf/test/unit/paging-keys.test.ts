import assert from "node:assert/strict";
import { test } from "node:test";
import { keyMove, type KeyContext } from "../../src/shared/paging-keys";
import { pageAxisState } from "../../src/shared/page-window";

const view = (
  patch: Omit<Partial<KeyContext>, "room"> & {
    room?: Partial<KeyContext["room"]>;
  } = {},
): KeyContext => ({
  mode: "continuous",
  direction: "vertical",
  width: 800,
  height: 600,
  overflowsX: false,
  ...patch,
  room: { left: 0, right: 0, up: 0, down: 0, ...patch.room },
});

test("arrows pan while there is room, at most the room left", () => {
  assert.deepEqual(
    keyMove("ArrowRight", view({ overflowsX: true, room: { right: 500 } })),
    { type: "pan", x: 40, y: 0 },
  );
  assert.deepEqual(
    keyMove("ArrowRight", view({ overflowsX: true, room: { right: 10 } })),
    { type: "pan", x: 10, y: 0 },
  );
  assert.deepEqual(
    keyMove("ArrowLeft", view({ overflowsX: true, room: { left: 500 } })),
    { type: "pan", x: -40, y: 0 },
  );
  assert.deepEqual(keyMove("ArrowDown", view({ room: { down: 500 } })), {
    type: "pan",
    x: 0,
    y: 40,
  });
  assert.deepEqual(keyMove("ArrowUp", view({ room: { up: 500 } })), {
    type: "pan",
    x: 0,
    y: -40,
  });
});

test("Left/Right turn the page when the page fits across or pages are single, never on a zoomed continuous page", () => {
  assert.deepEqual(keyMove("ArrowRight", view()), { type: "page", delta: 1 });
  assert.deepEqual(keyMove("ArrowLeft", view()), { type: "page", delta: -1 });
  assert.equal(keyMove("ArrowRight", view({ overflowsX: true })), undefined);
  assert.deepEqual(
    keyMove("ArrowRight", view({ mode: "paged", overflowsX: true })),
    { type: "page", delta: 1 },
  );
  // Horizontal continuous: along the reading direction, stopping at the end.
  assert.deepEqual(
    keyMove(
      "ArrowRight",
      view({ direction: "horizontal", overflowsX: true, room: { right: 900 } }),
    ),
    { type: "pan", x: 40, y: 0 },
  );
  assert.equal(
    keyMove("ArrowRight", view({ direction: "horizontal", overflowsX: true })),
    undefined,
  );
});

test("Up/Down turn the page only in paged mode, out of room", () => {
  assert.equal(keyMove("ArrowDown", view()), undefined);
  assert.deepEqual(keyMove("ArrowDown", view({ mode: "paged" })), {
    type: "page",
    delta: 1,
  });
  assert.deepEqual(keyMove("ArrowUp", view({ mode: "paged" })), {
    type: "page",
    delta: -1,
  });
});

test("PageDown/PageUp pan a screen along the reading direction, then turn the page in paged mode", () => {
  assert.deepEqual(keyMove("PageDown", view({ room: { down: 5000 } })), {
    type: "pan",
    x: 0,
    y: 525,
  });
  assert.deepEqual(keyMove("PageUp", view({ room: { up: 100 } })), {
    type: "pan",
    x: 0,
    y: -100,
  });
  assert.deepEqual(
    keyMove(
      "PageDown",
      view({ direction: "horizontal", room: { right: 5000 } }),
    ),
    { type: "pan", x: 700, y: 0 },
  );
  assert.deepEqual(keyMove("PageDown", view({ mode: "paged" })), {
    type: "page",
    delta: 1,
  });
  assert.deepEqual(keyMove("PageUp", view({ mode: "paged" })), {
    type: "page",
    delta: -1,
  });
  assert.equal(keyMove("PageDown", view()), undefined);
  assert.equal(keyMove("Home", view()), undefined);
});

test("rapid page reversal ignores native padding before the scroll event clamps it", () => {
  // Fit-page navigation briefly lands twelve pixels beyond its sole allowed
  // offset: native scrollTo runs in rAF, constraint handling on scroll follows.
  const vertical = pageAxisState(1012, { min: 1000, max: 1000 });
  assert.deepEqual(
    keyMove(
      "PageUp",
      view({
        mode: "paged",
        room: { up: vertical.before, down: vertical.after },
      }),
    ),
    { type: "page", delta: -1 },
  );
  const horizontal = pageAxisState(988, { min: 1000, max: 1000 });
  assert.deepEqual(
    keyMove(
      "PageDown",
      view({
        mode: "paged",
        direction: "horizontal",
        room: { left: horizontal.before, right: horizontal.after },
      }),
    ),
    { type: "page", delta: 1 },
  );
});

test("zoomed page panning retains real room and starts inside its bounds", () => {
  const bounds = { min: 1000, max: 1600 };
  const inside = pageAxisState(1300, bounds);
  assert.deepEqual(inside, { position: 1300, before: 300, after: 300 });
  assert.deepEqual(
    keyMove("PageUp", view({ mode: "paged", room: { up: inside.before } })),
    { type: "pan", x: 0, y: -300 },
  );
  const overshoot = pageAxisState(1612, bounds);
  const move = keyMove(
    "ArrowUp",
    view({ mode: "paged", room: { up: overshoot.before } }),
  );
  assert.deepEqual(move, { type: "pan", x: 0, y: -40 });
  assert.equal(overshoot.position + (move?.type === "pan" ? move.y : 0), 1560);
  const undershoot = pageAxisState(988, bounds);
  assert.deepEqual(undershoot, { position: 1000, before: 0, after: 600 });
});
