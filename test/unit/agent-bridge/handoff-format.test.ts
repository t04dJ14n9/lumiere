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
    "9d29aaed6ffc09359ffccbefc254f7f5542ed7cd2fc8de1970632595471f52c3",
  "docs/agent-handoff-format.md":
    "4422afadf038d3904f755be844abf94f39381f4a7f25d05dd3db93b5edd56e25",
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
