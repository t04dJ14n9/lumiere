import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  markdownHandoffText,
  pdfHandoffText,
} from "../../../src/shared/bridge/text";
import { noteIdentity } from "../../../src/shared/bridge/identity";

interface Fixture {
  notePayloads: { reference: string; selection: string; text: string }[];
  pdfTexts: {
    selection: { text: string; pages: { page: number; rects: number[][] }[] };
    source: { path: string; sha256: string };
    text: string;
  }[];
}

const fixture = JSON.parse(
  readFileSync("../agents/test/fixtures/agent-handoff-format.json", "utf8"),
) as Fixture;

test("markdown clipboard text matches the shared handoff fixture", () => {
  for (const item of fixture.notePayloads) {
    assert.equal(
      markdownHandoffText(item.reference, item.selection),
      item.text,
    );
  }
});

test("the one-page PDF source link matches the shared handoff fixture", () => {
  const item = fixture.pdfTexts[0]!;
  const rect = item.selection.pages[0]!.rects[0]!;
  assert.equal(
    pdfHandoffText({
      path: item.source.path,
      page: item.selection.pages[0]!.page,
      viewRect: {
        x: rect[0]!,
        y: rect[1]!,
        width: rect[2]! - rect[0]!,
        height: rect[3]! - rect[1]!,
      },
      sourceSha256: item.source.sha256,
      text: item.selection.text,
    }),
    item.text,
  );
});

test("a single local folder uses the decoded relative path", () => {
  const identity = noteIdentity("file:///vault/folder/A%20B.md", [
    "file:///vault",
  ]);
  assert.deepEqual(identity, {
    kind: "file",
    identity: "folder/A B.md",
    relative: "folder/A B.md",
  });
});

test("more than one folder keeps the full URI", () => {
  const identity = noteIdentity("file:///vault/folder/a.md", [
    "file:///vault",
    "file:///other",
  ]);
  assert.equal(identity.identity, "file:///vault/folder/a.md");
  assert.equal(identity.relative, undefined);
});

test("untitled and remote notes are not given a workspace path", () => {
  assert.equal(noteIdentity("untitled:1", ["file:///vault"]).kind, "untitled");
  assert.equal(
    noteIdentity("vscode-remote://host/a.md", ["file:///vault"]).kind,
    "remote",
  );
});
