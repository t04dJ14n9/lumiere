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

test("external alias plus unsafe integer has no fallback draft (no rounded serial)", () => {
  const body =
    "factors: &f [risk]\ndecision_conf:\n  score: 0.82\n  serial: 9007199254740993\n  factors: *f\n";
  const document = parseDocument(body);
  const value = document.toJS().decision_conf;
  assert.equal(value.serial, 9007199254740992);
  assert.equal(propertyYamlInput("score: 0.82\nfactors: *f\n"), undefined);
  assert.equal(
    propertyYamlDraft(
      body,
      document.get("decision_conf", true),
      value,
      document,
    ),
    undefined,
  );
});

test("colliding mapping keys have no fallback draft (no dropped entry)", () => {
  const body = 'generated:\n  1: first\n  "1": second\n  by: old\n';
  const document = parseDocument(body);
  const value = document.toJS().generated;
  assert.deepEqual(value, { "1": "second", by: "old" });
  assert.equal(
    propertyYamlInput('1: first\n"1": second\nby: old\n'),
    undefined,
  );
  assert.equal(
    propertyYamlDraft(body, document.get("generated", true), value, document),
    undefined,
  );
});

test("external aliases without a standalone raw slice get no stringify fallback", () => {
  const body =
    "factors: &f [evidence, risk]\ndecision_conf:\n  score: 0.82\n  factors: *f\n";
  const document = parseDocument(body);
  const value = document.toJS().decision_conf;
  assert.equal(propertyYamlInput("score: 0.82\nfactors: *f\n"), undefined);
  assert.equal(
    propertyYamlDraft(
      body,
      document.get("decision_conf", true),
      value,
      document,
    ),
    undefined,
  );
});

test("a settable value without a usable raw slice has no YAML draft", () => {
  const value = { score: 0.82, factors: [{ name: "evidence" }] };
  const document = parseDocument("decision_conf: {score: 0.5}\n");
  for (const node of [document.get("decision_conf", true), undefined]) {
    assert.equal(propertyYamlDraft("", node, value, document), undefined);
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
