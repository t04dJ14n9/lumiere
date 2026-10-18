import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { metadata } from "../../../src/markdown/metadata";
import { SNAPSHOT_VERSION } from "../../../src/plugins/vault/snapshot";

/**
 * Notes that touch every kind of metadata the vault caches. A cached note is
 * parsed again only when its text changes, so a parser change that alters
 * this output must also bump SNAPSHOT_VERSION, or vaults keep the old
 * results (as they kept `0~` and `12~` after the tag grammar changed).
 */
const CORPUS = [
  "---\naliases: [Start]\ntags: [fixture, ' #trimmed ']\n---\n# Title\n\nText.",
  "Tags: #a #b/c #0~#11 #12/#13 !!#0000ff (#q) [#r] #中文，标点 #ta~b #🙂em",
  "Links: [[Target]] [[Target#Heading|alias]] [[Target#^block]] ![[pic.png|200]]",
  "[md](Other.md#part) ![img](assets/a.png) https://example.com",
  "## Heading two\n\nPara with a block id ^block-1\n\n- [ ] task\n- [x] done",
  "Footnote[^1] and #tag-in-text.\n\n[^1]: Note with #footnote-tag.",
  "```js\n#not-a-tag [[NotALink]]\n```\n\n`#code` and %%#comment%% #after",
];

/** The digest for this SNAPSHOT_VERSION; change both together. */
const PINNED = {
  version: 4,
  digest: "089dd8e1d7561434825d5265655e6949de3cb2823fbd9fc9d612f76c58e1533a",
};

test("the parser's output is pinned to the snapshot version, so cached vaults are parsed again when it changes", () => {
  const digest = createHash("sha256")
    .update(JSON.stringify(CORPUS.map((note) => metadata(note))))
    .digest("hex");
  assert.equal(
    SNAPSHOT_VERSION,
    PINNED.version,
    "SNAPSHOT_VERSION changed: pin the digest below for it",
  );
  assert.equal(
    digest,
    PINNED.digest,
    "The vault parser's output changed: bump SNAPSHOT_VERSION in snapshot.ts and pin this digest with it",
  );
});
