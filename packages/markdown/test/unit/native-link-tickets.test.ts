import assert from "node:assert/strict";
import { test } from "node:test";
import { LinkTickets } from "../../src/host/link-tickets";
import { nodeDigests } from "@workshop/platform/node";
test("signed links survive 513 links and other documents without retaining a mailbox", () => {
  const tickets = new LinkTickets(nodeDigests);
  const first = tickets.issue({
    source: "file:///vault/a.md",
    version: 1,
    from: 0,
    to: 8,
    raw: "a.md#one",
    href: "a.md#one",
  });
  for (let n = 0; n < 1024; n++) {
    tickets.issue({
      source: `file:///vault/${n}.md`,
      version: 1,
      from: 0,
      to: 8,
      raw: "a.md#two",
      href: "a.md#two",
    });
  }
  assert.equal(tickets.read(...first)?.href, "a.md#one");
  assert.equal(
    tickets.read(
      first[0].slice(0, -1) + (first[0].endsWith("A") ? "B" : "A"),
      first[1],
    ),
    undefined,
  );
  assert.equal(new LinkTickets(nodeDigests).read(...first), undefined);
  tickets.dispose();
  assert.equal(tickets.read(...first), undefined);
});

test("command URI decoding cannot mutate encoded paths inside signed tickets", () => {
  const tickets = new LinkTickets(nodeDigests);
  const ticket = {
    source: "file:///vault/%E7%9B%AE%20note.md",
    version: 1,
    from: 0,
    to: 8,
    raw: "docs/%E7%9B%AE%20space.pdf#page=3",
    href: "docs/%E7%9B%AE%20space.pdf#page=3",
  };
  const signed = tickets.issue(ticket);
  const twiceDecoded = JSON.parse(
    decodeURIComponent(
      decodeURIComponent(encodeURIComponent(JSON.stringify(signed))),
    ),
  );
  assert.deepEqual(tickets.read(...(twiceDecoded as [string, string])), ticket);
});
