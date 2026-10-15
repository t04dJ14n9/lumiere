import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { agentPayload } from "../../../src/plugins/agentBridge/reference";
import {
  formatMarkdownAgentReference,
  formatUriAgentReference,
} from "../../../src/shared/agent-reference";

/**
 * docs/agent-handoff-format.md and this fixture are byte-identical in Agent
 * PDF Viewer. If a hash changes, update both repositories together.
 */
const PINNED = {
  "test/fixtures/agent-handoff-format.json":
    "1578be9c39029c78ca4be2306f025f43077584ac8a5d3484b62a5b9222b315fe",
  "docs/agent-handoff-format.md":
    "065c077095fa39f5befd543743efd891aef578cdefb5e55f079f99ddea08f5d8",
};

interface Fixture {
  noteReferences: {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }[];
  notePayloads: { reference: string; selection: string; text: string }[];
}

const fixture = JSON.parse(
  readFileSync("test/fixtures/agent-handoff-format.json", "utf8"),
) as Fixture;

test("the shared handoff format files match the copies in Agent PDF Viewer", () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    assert.equal(actual, hash, `${file} changed; update Agent PDF Viewer too`);
  }
});

test("note references follow the shared handoff format", () => {
  for (const { path, startLine, endLine, text } of fixture.noteReferences) {
    const format = /^[a-z][a-z0-9+.-]*:/i.test(path)
      ? formatUriAgentReference
      : formatMarkdownAgentReference;
    assert.equal(format(path, startLine, endLine), text);
  }
});

test("note payloads follow the shared handoff format", () => {
  for (const { reference, selection, text } of fixture.notePayloads) {
    assert.equal(agentPayload(reference, selection), text);
  }
});
