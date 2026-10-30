import test from "node:test";
import assert from "node:assert/strict";
import {
  isAttachableExplorerPath,
  shouldReclaimExplorerOpen,
} from "../../../src/attachments/explorer-open";

test("isAttachableExplorerPath accepts common media and rejects notes/code", () => {
  assert.equal(isAttachableExplorerPath("/vault/shot.png"), true);
  assert.equal(isAttachableExplorerPath("C:\\vault\\photo.JPEG"), true);
  assert.equal(isAttachableExplorerPath("/vault/doc.pdf"), true);
  assert.equal(isAttachableExplorerPath("/vault/clip.webm"), true);
  assert.equal(isAttachableExplorerPath("/vault/note.md"), false);
  assert.equal(isAttachableExplorerPath("/vault/app.ts"), false);
  assert.equal(isAttachableExplorerPath("/vault/readme"), false);
});

test("shouldReclaimExplorerOpen requires pinned media over a prior Lumière note", () => {
  // Workbench EditorDropTarget opens Explorer tree drops with pinned:true
  // (isPreview false). Single-click Explorer opens are preview tabs.
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: false,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    true,
    "Explorer drop-without-Shift opens a pinned media tab",
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: true,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    false,
    "single-click preview opens stay as tabs (not drop-on-note)",
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: false,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: false,
    }),
    false,
    "do not steal opens when Lumière was not the prior active editor",
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: false,
      groupHadLumiereNote: false,
      priorActiveWasLumiere: true,
    }),
    false,
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/note.md",
      isPreview: false,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    false,
  );
});
