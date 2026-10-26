import test from "node:test";
import assert from "node:assert/strict";
import {
  sketchEmbedOf,
  type EmbedElement,
} from "../../../src/plugins/sketch/taps";

/** An element and the attributes of the `[data-resource]` holder around it. */
function element(
  tagName: string,
  holder?: Record<string, string>,
): EmbedElement {
  return {
    tagName,
    closest: (selector) => {
      assert.equal(selector, "[data-resource]");
      return holder
        ? { getAttribute: (name: string) => holder[name] ?? null }
        : null;
    },
  };
}

test("a sketch's image names the sketch as its embed links it", () => {
  assert.deepEqual(
    sketchEmbedOf(
      element("IMG", {
        "data-resource": "2026-10-22 14.03.sketch.svg",
        "data-wiki": "true",
      }),
    ),
    { target: "2026-10-22 14.03.sketch.svg", syntax: "wikilink" },
  );
  assert.deepEqual(
    sketchEmbedOf(
      element("IMG", {
        "data-resource": "Attachments/2026-10-22%2014.03.sketch.svg",
      }),
    ),
    {
      target: "Attachments/2026-10-22%2014.03.sketch.svg",
      syntax: "markdown",
    },
  );
});

test("other images, buttons and missing embeds are left to embeds", () => {
  for (const tapped of [
    element("IMG", { "data-resource": "photo.png", "data-wiki": "true" }),
    element("IMG", { "data-resource": "plan.svg" }),
    element("IMG"),
    element("BUTTON", { "data-resource": "a.sketch.svg" }),
    element("SPAN", { "data-resource": "a.sketch.svg" }),
  ]) {
    assert.equal(sketchEmbedOf(tapped), undefined);
  }
});

test("a sketch linked with a fragment still counts", () => {
  assert.equal(
    sketchEmbedOf(element("IMG", { "data-resource": "a.sketch.svg#part" }))
      ?.target,
    "a.sketch.svg#part",
  );
});
