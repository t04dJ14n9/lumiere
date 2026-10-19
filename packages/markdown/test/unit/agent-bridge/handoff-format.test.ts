import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { agentPayload } from "../../../src/plugins/agentBridge/reference";
import {
  formatMarkdownAgentReference,
  formatUriAgentReference,
} from "../../../src/shared/agent-reference";

interface Fixture {
  noteReferences: {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }[];
  notePayloads: { reference: string; selection: string; text: string }[];
}

/** The one handoff format both products write: packages/agents/docs/agent-handoff-format.md. */
const HANDOFF_FIXTURE = "../agents/test/fixtures/agent-handoff-format.json";

const fixture = JSON.parse(readFileSync(HANDOFF_FIXTURE, "utf8")) as Fixture;

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
