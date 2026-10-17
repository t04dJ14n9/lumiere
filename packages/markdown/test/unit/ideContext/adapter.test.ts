import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMwIdeContextPacket,
  assertMwPacket,
} from "../../../src/plugins/ideContext/adapter";
import { DEFAULT_CAPS } from "../../../src/shared/ide-context";

test("adapter builds packet with product markdownWorkshop and no pdf key", () => {
  const packet = buildMwIdeContextPacket({
    uri: "file:///note.md",
    editorKind: "livePreview",
    panelId: "p1",
    host: {
      listTabs: () => ({ visible: ["file:///note.md"], open: [] }),
      getDiagnostics: () => [],
    },
    caps: DEFAULT_CAPS,
  });
  assert.equal(packet.product, "markdownWorkshop");
  assert.equal(packet.markdown.editorKind, "livePreview");
  assert.equal(
    "pdf" in packet && (packet as { pdf?: unknown }).pdf !== undefined,
    false,
  );
  assertMwPacket(packet);
});
