import assert from "node:assert/strict";
import { test } from "node:test";
import { NavigationIntent } from "../../src/shared/navigation-intent";

function gate() {
  let release: () => void = () => undefined;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release };
}

/** Controlled layout and zoom callbacks; no browser, timers or render engine. */
function restoration(intent: NavigationIntent, token: number, name: string, mutations: string[]) {
  const layout = gate();
  const zoom = gate();
  const completed = (async () => {
    await layout.ready;
    if (!intent.owns(token)) return false;
    mutations.push(`${name}:zoom`);
    await zoom.ready;
    if (!intent.owns(token)) return false;
    mutations.push(`${name}:scroll`);
    return true;
  })();
  return {
    layoutReady: async () => { layout.release(); await Promise.resolve(); },
    zoomSettled: () => { zoom.release(); },
    completed,
  };
}

test("reading the current intent is stable; advancing invalidates every earlier token", () => {
  const intent = new NavigationIntent();
  const startup = intent.current();
  assert.equal(startup, 0);
  assert.equal(intent.current(), startup);
  assert.equal(intent.owns(startup), true);
  const first = intent.advance();
  const second = intent.advance();
  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(intent.current(), second);
  assert.equal(intent.owns(startup), false);
  assert.equal(intent.owns(first), false);
  assert.equal(intent.owns(second), true);
});

test("an uninterrupted startup restores zoom and then scroll", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const startup = restoration(intent, intent.current(), "startup", mutations);
  assert.deepEqual(mutations, []);
  await startup.layoutReady();
  assert.deepEqual(mutations, ["startup:zoom"]);
  startup.zoomSettled();
  assert.equal(await startup.completed, true);
  assert.deepEqual(mutations, ["startup:zoom", "startup:scroll"]);
});

test("an explicit link before layout cancels both delayed startup mutations", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const startup = restoration(intent, intent.current(), "startup", mutations);
  intent.advance();
  mutations.push("link:scroll");
  await startup.layoutReady();
  startup.zoomSettled();
  assert.equal(await startup.completed, false);
  assert.deepEqual(mutations, ["link:scroll"]);
});

test("an explicit link while startup zoom settles prevents its delayed scroll", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const startup = restoration(intent, intent.current(), "startup", mutations);
  await startup.layoutReady();
  assert.deepEqual(mutations, ["startup:zoom"]);
  intent.advance();
  mutations.push("link:scroll");
  startup.zoomSettled();
  assert.equal(await startup.completed, false);
  assert.deepEqual(mutations, ["startup:zoom", "link:scroll"]);
});

for (const input of ["wheel", "pointer", "key", "touch"]) {
  for (const stage of ["layout", "zoom settle"]) {
    test(`${input} input during ${stage} cancels remaining restoration mutations`, async () => {
      const intent = new NavigationIntent();
      const mutations: string[] = [];
      const startup = restoration(intent, intent.current(), "startup", mutations);
      if (stage === "zoom settle") await startup.layoutReady();
      intent.advance();
      await startup.layoutReady();
      startup.zoomSettled();
      assert.equal(await startup.completed, false);
      assert.deepEqual(mutations, stage === "layout" ? [] : ["startup:zoom"]);
    });
  }
}

test("repeated reloads leave only the newest generation able to restore", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const initial = restoration(intent, intent.current(), "initial", mutations);
  const firstReload = restoration(intent, intent.advance(), "first reload", mutations);
  await firstReload.layoutReady();
  const latestReload = restoration(intent, intent.advance(), "latest reload", mutations);
  await latestReload.layoutReady();
  latestReload.zoomSettled();
  assert.equal(await latestReload.completed, true);
  await initial.layoutReady();
  initial.zoomSettled();
  firstReload.zoomSettled();
  assert.equal(await initial.completed, false);
  assert.equal(await firstReload.completed, false);
  assert.deepEqual(mutations, ["first reload:zoom", "latest reload:zoom", "latest reload:scroll"]);
});

test("a new replay cancels an older completion without canceling itself", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const older = restoration(intent, intent.advance(), "older", mutations);
  await older.layoutReady();
  const latestToken = intent.advance();
  const latest = restoration(intent, latestToken, "latest", mutations);
  older.zoomSettled();
  assert.equal(await older.completed, false);
  assert.equal(intent.owns(latestToken), true);
  await latest.layoutReady();
  latest.zoomSettled();
  assert.equal(await latest.completed, true);
  assert.deepEqual(mutations, ["older:zoom", "latest:zoom", "latest:scroll"]);
});

test("a replay that finishes first cannot be overwritten by an older delayed layout", async () => {
  const intent = new NavigationIntent();
  const mutations: string[] = [];
  const older = restoration(intent, intent.advance(), "older", mutations);
  const latest = restoration(intent, intent.advance(), "latest", mutations);
  await latest.layoutReady();
  latest.zoomSettled();
  assert.equal(await latest.completed, true);
  await older.layoutReady();
  older.zoomSettled();
  assert.equal(await older.completed, false);
  assert.deepEqual(mutations, ["latest:zoom", "latest:scroll"]);
});

test("navigation in one webview does not cancel another webview's restoration", async () => {
  const first = new NavigationIntent();
  const second = new NavigationIntent();
  const mutations: string[] = [];
  const startup = restoration(second, second.current(), "second webview", mutations);
  first.advance();
  await startup.layoutReady();
  startup.zoomSettled();
  assert.equal(await startup.completed, true);
  assert.deepEqual(mutations, ["second webview:zoom", "second webview:scroll"]);
});
