import test from "node:test";
import assert from "node:assert/strict";
import { FENCED_PREVIEW } from "../../webview/ui/markdown-widget";
import { diagramLanguage } from "./webview";
test("diagrams claim only the Mermaid fence language", () => {
  assert.equal(diagramLanguage(" mermaid title"), true);
  assert.equal(diagramLanguage("MERMAID"), true);
  assert.equal(diagramLanguage("mermaid-extra"), false);
  assert.equal(diagramLanguage("javascript"), false);
});

test("rendered fences reveal only from the Edit button, selecting the code", () => {
  assert.equal(FENCED_PREVIEW.reveal, "button");
  assert.equal(FENCED_PREVIEW.guardMargin, true);
  const source = "```mermaid\nflowchart LR\nA --> B\n```";
  const span = FENCED_PREVIEW.select!(source);
  assert.equal(source.slice(span.from, span.to), "flowchart LR\nA --> B");
});

test("an empty or unclosed fence still gives the code a place", () => {
  const body = (source: string) => {
    const span = FENCED_PREVIEW.select!(source);
    return [span.from, span.to];
  };
  // Empty: the end of the opening line.
  assert.deepEqual(body("```mermaid\n```"), [10, 10]);
  // Unclosed: the code runs to the end.
  assert.deepEqual(body("```mermaid\nA --> B"), [11, 18]);
  assert.deepEqual(body("~~~mermaid\nA\n~~~"), [11, 12]);
});
