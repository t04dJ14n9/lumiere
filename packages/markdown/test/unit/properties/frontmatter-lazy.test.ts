import assert from "node:assert/strict";
import test from "node:test";
import {
  frontmatter,
  headerParts,
} from "../../../src/markdown/properties/frontmatter";
import { frontmatterLinks } from "../../../src/markdown/metadata/frontmatter";
import { metadata } from "../../../src/markdown/metadata";

test("notes without a --- fence expose no frontmatter and no links", () => {
  const source = "# Title\n\nBody [[Note]]\n";
  assert.equal(headerParts(source), undefined);
  assert.equal(frontmatter(source), undefined);
  assert.deepEqual(
    frontmatterLinks(source, (from, to) => ({
      start: { line: 0, col: from, offset: from },
      end: { line: 0, col: to, offset: to },
    })),
    [],
  );
  assert.equal(metadata(source).frontmatter, undefined);
  assert.deepEqual(metadata(source).frontmatterLinks, []);
});

test("frontmatterLinks reuses a parsed document from frontmatter()", () => {
  const source = '---\ntitle: Hi\nlink: "[[Target]]"\n---\n\nBody\n';
  const header = frontmatter(source);
  assert.ok(header?.yaml);
  const position = (from: number, to: number) => ({
    start: { line: 0, col: from, offset: from },
    end: { line: 0, col: to, offset: to },
  });
  const fromParsed = frontmatterLinks(source, position, header!.yaml);
  const fromScratch = frontmatterLinks(source, position);
  assert.equal(fromParsed.length, 1);
  assert.equal(fromParsed[0]!.link, "Target");
  assert.deepEqual(
    fromParsed.map((l) => ({ key: l.key, link: l.link, original: l.original })),
    fromScratch.map((l) => ({
      key: l.key,
      link: l.link,
      original: l.original,
    })),
  );
});

test("metadata frontmatterLinks match a single parse of wikilinks in YAML", () => {
  const source = '---\nrefs:\n  - "[[One]]"\n  - "[[Two|Alias]]"\n---\n';
  const meta = metadata(source);
  assert.deepEqual(
    meta.frontmatterLinks.map((l) => l.link),
    ["One", "Two"],
  );
});
