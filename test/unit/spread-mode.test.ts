import assert from "node:assert/strict";
import { test } from "node:test";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { PAGE_LAYOUTS } from "../../src/shared/view-options";
import { viewerPlugins } from "../../src/webview/plugins";
import {
  prepareReadingPosition,
  rememberedPosition,
  rememberPosition,
} from "../../src/webview/reading-position";
import { nativeSpread } from "../../src/webview/spread-mode";

test("page layouts map to native none, odd (1–2) and even (cover, 2–3) modes", () => {
  assert.equal(nativeSpread("single"), SpreadMode.None);
  assert.equal(nativeSpread("spread"), SpreadMode.Odd);
  assert.equal(nativeSpread("spreadCover"), SpreadMode.Even);
  assert.deepEqual(
    PAGE_LAYOUTS.map(({ value }) => nativeSpread(value)),
    [SpreadMode.None, SpreadMode.Odd, SpreadMode.Even],
  );
});

test("spread registration restores the saved layout before scroll and zoom start", () => {
  prepareReadingPosition(
    { pageLayout: "spread" },
    {
      page: 2,
      top: 0,
      left: 0,
      zoom: "fitPage",
      pageLayout: "spreadCover",
      scrollMode: "paged",
      scrollDirection: "horizontal",
    },
  );
  const saved = rememberedPosition();
  assert.equal(saved.pageLayout, "spreadCover");
  for (const { value: pageLayout } of PAGE_LAYOUTS) {
    rememberPosition({ ...saved, pageLayout });
    const plugins = viewerPlugins(new ArrayBuffer(0));
    const ids = plugins.map(({ package: plugin }) => plugin.manifest.id);
    const spread = plugins.find(
      ({ package: plugin }) => plugin.manifest.id === "spread",
    );
    assert.deepEqual(spread?.config, {
      defaultSpreadMode: nativeSpread(pageLayout),
    });
    assert.ok(ids.indexOf("viewport") < ids.indexOf("spread"));
    assert.ok(ids.indexOf("spread") < ids.indexOf("scroll"));
    assert.ok(ids.indexOf("spread") < ids.indexOf("zoom"));
  }
  rememberPosition(saved);
});
