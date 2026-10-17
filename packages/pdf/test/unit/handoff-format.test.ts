import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { agentText } from "../../src/shared/agent-text";
import { notePayload, noteReference } from "@workshop/agents/handoff";
import type { PdfSelection } from "../../src/shared/selection";

interface Fixture {
  noteReferences: {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }[];
  notePayloads: { reference: string; selection: string; text: string }[];
  pdfTexts: {
    selection: PdfSelection;
    source: { path: string; sha256: string };
    text: string;
  }[];
}

/** The one handoff format both products write: packages/agents/docs/agent-handoff-format.md. */
const HANDOFF_FIXTURE = "../agents/test/fixtures/agent-handoff-format.json";

const fixture = JSON.parse(readFileSync(HANDOFF_FIXTURE, "utf8")) as Fixture;

test("note references and payloads follow the shared handoff format", () => {
  for (const { path, startLine, endLine, text } of fixture.noteReferences) {
    assert.equal(noteReference(path, startLine, endLine, false), text);
  }
  for (const { reference, selection, text } of fixture.notePayloads) {
    assert.equal(notePayload(reference, selection), text);
  }
});

test("PDF selections follow the shared handoff format", () => {
  for (const { selection, source, text } of fixture.pdfTexts) {
    assert.equal(agentText(selection, source), text);
  }
});
