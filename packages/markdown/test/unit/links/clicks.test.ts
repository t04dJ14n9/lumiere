import test from "node:test";
import assert from "node:assert/strict";
import {
  allowsLinkClick,
  holds,
  isAltEditLinkClick,
  placeOfClick,
} from "../../../src/plugins/links/clicks";

const click = (
  keys: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>>,
) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...keys,
});

test("Mod alone follows in the same editor; Mod+Alt opens beside (BH-020)", () => {
  assert.deepEqual(placeOfClick(click({})), { side: false, tab: false });
  assert.deepEqual(placeOfClick(click({ metaKey: true })), {
    side: false,
    tab: false,
  });
  assert.deepEqual(placeOfClick(click({ ctrlKey: true })), {
    side: false,
    tab: false,
  });
  assert.deepEqual(placeOfClick(click({ metaKey: true, altKey: true })), {
    side: true,
    tab: false,
  });
  assert.deepEqual(placeOfClick(click({ ctrlKey: true, altKey: true })), {
    side: true,
    tab: false,
  });
  // Alt alone does not follow; placeOfClick is unused for that gesture.
  assert.deepEqual(placeOfClick(click({ altKey: true })), {
    side: false,
    tab: false,
  });
});

test("follow requires Ctrl or Cmd; plain click does not open (BH-020)", () => {
  assert.equal(allowsLinkClick(click({})), false);
  assert.equal(allowsLinkClick(click({ altKey: true })), false);
  assert.equal(allowsLinkClick(click({ ctrlKey: true })), true);
  assert.equal(allowsLinkClick(click({ metaKey: true })), true);
  assert.equal(allowsLinkClick(click({ ctrlKey: true, altKey: true })), true);
});

test("a link's box holds a click up to, not including, its right and bottom edges", () => {
  // The last pixel of a link's text, which Chromium hit-tests as its line.
  const box = { left: 102.75, right: 130.23, top: 35, bottom: 54 };
  assert.equal(holds(box, 129.73, 44), true);
  assert.equal(holds(box, 102.75, 35), true);
  assert.equal(holds(box, 130.23, 44), false);
  assert.equal(holds(box, 120, 54), false);
  assert.equal(holds(box, 100, 44), false);
});

test("Alt alone on a rendered link is an edit-caret click, not open or multi-cursor", () => {
  const rendered = {
    classList: { contains: (name: string) => name === "md-link-rendered" },
    tagName: "SPAN",
  };
  assert.equal(
    isAltEditLinkClick(
      {
        button: 0,
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
      rendered,
    ),
    true,
  );
  // Cmd+Alt still opens beside — not an edit click.
  assert.equal(
    isAltEditLinkClick(
      {
        button: 0,
        altKey: true,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
      rendered,
    ),
    false,
  );
  // Plain click opens; Shift extends.
  assert.equal(
    isAltEditLinkClick(
      {
        button: 0,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
      rendered,
    ),
    false,
  );
  assert.equal(
    isAltEditLinkClick(
      {
        button: 0,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
      },
      rendered,
    ),
    false,
  );
});

test("allowsLinkClick permits plain clicks on rendered HTML <a> links (table cells, callouts, embeds)", () => {
  assert.equal(allowsLinkClick(click({}), { tagName: "A" }), true);
  assert.equal(allowsLinkClick(click({}), { tagName: "SPAN" }), false);
});
