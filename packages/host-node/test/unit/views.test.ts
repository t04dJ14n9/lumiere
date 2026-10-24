import test from "node:test";
import assert from "node:assert/strict";
import { VIEW_ID as BACKLINKS } from "../../../markdown/src/plugins/backlinks/tree";
import { VIEW_ID as OUTLINE } from "../../../markdown/src/plugins/outline/commands";
import { VIEW_ID as OUTGOING } from "../../../markdown/src/plugins/outgoingLinks/tree";
import { VIEW_ID as TAGS } from "../../../markdown/src/plugins/tags/tree";
import { VIEW_IDS } from "../../src/views";

test("the view ids embedders ask for are the plugins' own", () => {
  assert.deepEqual(VIEW_IDS, {
    outline: OUTLINE,
    backlinks: BACKLINKS,
    outgoingLinks: OUTGOING,
    tags: TAGS,
  });
});
