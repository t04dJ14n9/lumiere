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

test("shouldReclaimExplorerOpen requires preview media over a prior Lumière note", () => {
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: true,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    true,
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: false,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    false,
    "permanent (double-click) opens stay as tabs",
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: true,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: false,
    }),
    false,
    "do not steal opens when Lumière was not the prior active editor",
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/a.png",
      isPreview: true,
      groupHadLumiereNote: false,
      priorActiveWasLumiere: true,
    }),
    false,
  );
  assert.equal(
    shouldReclaimExplorerOpen({
      openedPath: "/vault/note.md",
      isPreview: true,
      groupHadLumiereNote: true,
      priorActiveWasLumiere: true,
    }),
    false,
  );
});
