import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import { propertyYamlDraft } from "../../../src/markdown/properties/yaml-draft";
import { propertyYamlInput } from "../../../src/markdown/properties/values";

test("raw YAML drafts retain comments, quoting and exact integers", () => {
  const body =
    "decision_conf:\n  score: 0.82 # keep\n  rationale: '01'\n  count: 9007199254740993\n";
  const document = parseDocument(body);
  const value = document.toJS().decision_conf;
  assert.equal(
    propertyYamlDraft(
      body,
      document.get("decision_conf", true),
      value,
      document,
    ),
    "score: 0.82 # keep\nrationale: '01'\ncount: 9007199254740993\n",
  );
});

test("an independent draft serializes nested aliases defined outside the property", () => {
  const body =
    "factors: &f [evidence, risk]\ndecision_conf:\n  score: 0.82\n  factors: *f\n";
  const document = parseDocument(body);
  const value = document.toJS().decision_conf;
  assert.equal(propertyYamlInput("score: 0.82\nfactors: *f\n"), undefined);
  const draft = propertyYamlDraft(
    body,
    document.get("decision_conf", true),
    value,
    document,
  );
  assert.equal(typeof draft, "string");
  assert.deepEqual(propertyYamlInput(draft!), value);
});

test("a settable value gets a serialized draft when ranges or raw equality are unavailable", () => {
  const value = { score: 0.82, factors: [{ name: "evidence" }] };
  const document = parseDocument("decision_conf: {score: 0.5}\n");
  for (const node of [document.get("decision_conf", true), undefined]) {
    const draft = propertyYamlDraft("", node, value, document);
    assert.equal(typeof draft, "string");
    assert.deepEqual(propertyYamlInput(draft!), value);
  }
});

for (const yaml of [
  "!!pairs [a: 1]",
  "!!map {a: 1}",
  "&a {child: *a}",
  ".inf",
  "{at: !!timestamp 2026-10-15}",
]) {
  test(`unsupported ${yaml} has no YAML draft`, () => {
    const body = `value: ${yaml}\n`;
    const document = parseDocument(body);
    assert.equal(
      propertyYamlDraft(
        body,
        document.get("value", true),
        document.toJS().value,
        document,
      ),
      undefined,
    );
  });
}
