import test from "node:test";
import assert from "node:assert/strict";
import { PropertyPresentation } from "./presentation";
import type { LivePreview } from "../livePreview/api";

test("showing an already-visible sheet keeps its widget and unnamed draft rows", () => {
  let installed = 0;
  let removed = 0;
  const preview = {
    block: () => {
      installed++;
      return () => {
        removed++;
      };
    },
  } as unknown as LivePreview;
  const presentation = new PropertyPresentation(
    preview,
    { source: "current", copy: () => {}, openMenu: () => () => {} },
    "visible",
  );
  presentation.install();
  presentation.configure("visible");
  assert.equal(installed, 1);
  assert.equal(removed, 0);
  presentation.configure("hidden");
  assert.equal(installed, 2);
  assert.equal(removed, 1);
  presentation.dispose();
  assert.equal(removed, 2);
});
