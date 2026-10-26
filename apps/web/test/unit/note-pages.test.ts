// A note's page is served by the service worker, which Chromium needs for
// the page's requests to reach it, and keeps the window's policy.
import test from "node:test";
import assert from "node:assert/strict";
import { NotePages } from "../../src/note-pages";
import { routeOf } from "../../src/shared/routes";

const BASE = "https://example.github.io/lumiere/";
const POLICY = `default-src 'self'; img-src 'self' data: blob:`;
const HTML = `<!doctype html><html><head><meta name="lumiere-panel" content="p1"></head><body></body></html>`;

/** The id a served page's address names. */
function pageId(url: string): string {
  const route = routeOf(url, BASE);
  assert.ok(route?.kind === "page", url);
  return route.id;
}

test("a page is served under the app while its tab is open", () => {
  const pages = new NotePages({
    base: BASE,
    policy: POLICY,
    isServed: () => true,
  });
  const page = pages.serve(HTML);
  assert.ok(page);
  const id = pageId(page.url);
  assert.match(pages.html(id)!, /lumiere-panel/);
  page.dispose();
  assert.equal(pages.html(id), undefined);
});

test("the window's policy comes first, so it holds everything in the page", () => {
  const pages = new NotePages({
    base: BASE,
    policy: `${POLICY}; x-test "<a>&"`,
    isServed: () => true,
  });
  assert.ok(
    pages
      .html(pageId(pages.serve(HTML)!.url))!
      .startsWith(
        `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; x-test &quot;&lt;a>&amp;&quot;"><meta name="lumiere-panel"`,
      ),
  );
});

test("each page has an address of its own that cannot be guessed", () => {
  const pages = new NotePages({
    base: BASE,
    policy: POLICY,
    isServed: () => true,
  });
  const first = pageId(pages.serve(HTML)!.url);
  const second = pageId(pages.serve(HTML)!.url);
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.notEqual(first, second);
});

test("without a worker to serve it, or a head to hold the policy, a page is a blob", () => {
  const unserved = new NotePages({
    base: BASE,
    policy: POLICY,
    isServed: () => false,
  });
  assert.equal(unserved.serve(HTML), undefined);
  const served = new NotePages({
    base: BASE,
    policy: POLICY,
    isServed: () => true,
  });
  assert.equal(served.serve("<p>No head</p>"), undefined);
});
