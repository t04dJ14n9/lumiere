import test from "node:test";
import assert from "node:assert/strict";
import {
  QueryClient,
  type SearchUpdate,
} from "../../../src/plugins/search/client";
import {
  protocol,
  type SearchResponse,
} from "../../../src/plugins/search/protocol";
import type { Cancellation } from "../../../src/shared/rpc/lifecycle";
import { rpcPair } from "../../support/rpc-pair";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test("query refresh cancels the old request and ignores late replies", async () => {
  const pair = rpcPair();
  const jobs: { resolve(value: SearchResponse): void; token: Cancellation }[] =
    [];
  pair.host.handle(
    protocol,
    "query",
    (_request, token) =>
      new Promise<SearchResponse>((resolve) => jobs.push({ resolve, token })),
  );
  const updates: SearchUpdate[] = [];
  const client = new QueryClient(pair.client);
  const stop = client.watch("tag:project", "file:///Note.md", (value) =>
    updates.push(value),
  );
  await tick();
  client.refresh();
  await tick();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]!.token.cancelled, true);
  jobs[0]!.resolve({
    results: [{ path: "Old.md", href: "Old.md" }],
    unreadable: 0,
  });
  await tick();
  assert.deepEqual(updates.at(-1), { loading: true });
  jobs[1]!.resolve({
    results: [{ path: "New.md", href: "New.md" }],
    unreadable: 0,
  });
  await tick();
  assert.deepEqual(updates.at(-1), {
    loading: false,
    results: [{ path: "New.md", href: "New.md" }],
    unreadable: 0,
  });
  stop();
  const count = updates.length;
  client.refresh();
  assert.equal(updates.length, count);
  client.watch("x", "file:///Note.md", (value) => updates.push(value));
  await tick();
  client.dispose();
  await tick();
  assert.equal(jobs.at(-1)!.token.cancelled, true);
  jobs.at(-1)!.resolve({ results: [], unreadable: 0 });
  await pair.dispose();
});
test("partial notifications paint matches while loading for the matching id", async () => {
  const pair = rpcPair();
  const jobs: {
    id: string | undefined;
    resolve(value: SearchResponse): void;
    token: Cancellation;
  }[] = [];
  pair.host.handle(protocol, "query", (request, token) => {
    return new Promise<SearchResponse>((resolve) =>
      jobs.push({ id: request.id, resolve, token }),
    );
  });
  const updates: SearchUpdate[] = [];
  const client = new QueryClient(pair.client);
  const stop = client.watch("meeting", "file:///Note.md", (value) =>
    updates.push(value),
  );
  await tick();
  assert.equal(jobs.length, 1);
  assert.ok(jobs[0]!.id);
  pair.host.notify(protocol, "partial", {
    id: jobs[0]!.id!,
    results: [{ path: "A.md", href: "A.md" }],
    unreadable: 0,
  });
  await tick();
  assert.deepEqual(updates.at(-1), {
    loading: true,
    results: [{ path: "A.md", href: "A.md" }],
    unreadable: 0,
  });
  pair.host.notify(protocol, "partial", {
    id: "other-id",
    results: [{ path: "Ignored.md", href: "Ignored.md" }],
    unreadable: 0,
  });
  await tick();
  assert.deepEqual(updates.at(-1), {
    loading: true,
    results: [{ path: "A.md", href: "A.md" }],
    unreadable: 0,
  });
  jobs[0]!.resolve({
    results: [
      { path: "A.md", href: "A.md" },
      { path: "B.md", href: "B.md" },
    ],
    unreadable: 0,
  });
  await tick();
  assert.deepEqual(updates.at(-1), {
    loading: false,
    results: [
      { path: "A.md", href: "A.md" },
      { path: "B.md", href: "B.md" },
    ],
    unreadable: 0,
  });
  stop();
  client.dispose();
  await pair.dispose();
});
test("search protocol rejects invalid request and result shapes", () => {
  assert.doesNotThrow(() =>
    protocol.requests.query.params.parse({
      query: "foo",
      source: "file:///Note.md",
    }),
  );
  assert.doesNotThrow(() =>
    protocol.requests.query.params.parse({
      query: "foo",
      source: "file:///Note.md",
      id: "q1",
    }),
  );
  assert.throws(() =>
    protocol.requests.query.params.parse({
      query: "foo",
      source: "file:///Note.md",
      id: "",
    }),
  );
  assert.throws(() =>
    protocol.requests.query.params.parse({
      query: "foo",
      source: "file:///Note.md",
      id: -1,
    }),
  );
  assert.throws(() =>
    protocol.notifications.partial.parse({
      id: "q1",
      results: [{ path: "One.md" }],
      unreadable: 0,
    }),
  );
  assert.throws(() =>
    protocol.requests.query.result.parse({
      results: [{ path: "One.md" }],
      unreadable: 0,
    }),
  );
  assert.throws(() =>
    protocol.requests.query.result.parse({ results: [], unreadable: -1 }),
  );
});
