import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_COLORS_ENGINE_AVAILABLE,
  renderablePageColors,
} from "../../src/shared/page-colors-engine";

test("patched EmbedPDF exposes page color-scheme: dark intent renders dark", () => {
  assert.equal(PAGE_COLORS_ENGINE_AVAILABLE, true);
  assert.equal(renderablePageColors("dark"), "dark");
  assert.equal(renderablePageColors("normal"), "normal");
});
