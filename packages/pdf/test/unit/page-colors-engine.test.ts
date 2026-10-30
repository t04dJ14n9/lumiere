import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_COLORS_ENGINE_AVAILABLE,
  renderablePageColors,
} from "../../src/shared/page-colors-engine";

test("pinned EmbedPDF fails closed: dark intent renders as normal", () => {
  assert.equal(PAGE_COLORS_ENGINE_AVAILABLE, false);
  assert.equal(renderablePageColors("dark"), "normal");
  assert.equal(renderablePageColors("normal"), "normal");
});
