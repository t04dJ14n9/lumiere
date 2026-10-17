import test from "node:test";
import assert from "node:assert/strict";
import { createRoot, type Infer } from "@workshop/core";
import { RevealRouter } from "../../../src/host/reveal-router";
import { linksHost } from "../../../src/plugins/links/host";
import { protocol } from "../../../src/plugins/links/protocol";
import type { VaultIndex } from "../../../src/plugins/vault/api";
import {
  CancelToken,
  type Cancellation,
} from "../../../src/shared/rpc/lifecycle";
import type {
  PanelShell,
  RevealPanel,
  Workshop,
} from "../../../src/shared/runtime";
import { rpcPair } from "../../support/rpc-pair";

type Target = Infer<typeof protocol.requests.navigate.params>;
type Navigate = (target: Target, token: Cancellation) => Promise<boolean>;

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  const root = createRoot();
  const pair = rpcPair();
  const router = new RevealRouter();
  const calls: { target: Target; token: Cancellation }[] = [];
  let registered: RevealPanel | undefined;
  let active = true;
  let navigate: Navigate = async (_target, token) => !token.cancelled;
  pair.client.handle(protocol, "navigate", (target, token) => {
    calls.push({ target, token });
    return navigate(target, token);
  });
  root.provide("rpc", pair.host);
  root.provide("resources", {
    async load() {
      throw new Error("unused");
    },
  });
  root.provide("vault", {
    root: "file:///vault",
    onDidResolve: () => () => {},
  } as unknown as VaultIndex);
  root.provide("workshop", {
    navigation: {
      registerReveal(panel: RevealPanel) {
        registered = panel;
        return router.register(panel);
      },
    },
  } as unknown as Workshop);
  const panel = {
    id: "pane",
    document: { uri: "file:///vault/Note.md" },
    active: () => active,
    reveal() {},
  } as unknown as PanelShell;
  const fiber = root.plugin(linksHost, { panel });
  await root.settled();
  assert.equal(fiber.state, "active", String(fiber.error));
  assert.ok(registered);
  return {
    root,
    router,
    calls,
    get reveal(): RevealPanel {
      assert.ok(registered);
      return registered;
    },
    loading: () => root.emit("editor/loading"),
    ready: (session: string) =>
      pair.client.call(protocol, "ready", { session }),
    setActive(value: boolean) {
      active = value;
    },
    setNavigate(handler: Navigate) {
      navigate = handler;
    },
    async dispose() {
      await root.dispose();
      await pair.dispose();
    },
  };
}

function cancelledResult(promise: Promise<boolean>): Promise<boolean> {
  return promise.catch((error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "Cancelled");
    return false;
  });
}

test("a native hunk offset waits for its webview session and crosses the validated navigation RPC", async (t) => {
  const setup = await fixture();
  t.after(() => setup.dispose());
  const delivery = setup.router.deliver(setup.router.begin(), "pane", {
    fragment: "",
    at: 9300,
  });
  setup.loading();
  assert.equal(setup.calls.length, 0);
  await setup.ready("hunk-session");
  assert.equal(await delivery, true);
  assert.equal(setup.calls.length, 1);
  assert.deepEqual(setup.calls[0]?.target, {
    fragment: "",
    at: 9300,
    requestId: 1,
    session: "hunk-session",
  });
});

test("cold first loading preserves the pending link reveal until its session is ready", async (t) => {
  const f = await fixture();
  t.after(() => f.dispose());
  const pending = f.reveal.reveal(
    { fragment: "Cold heading", requestId: 1 },
    new CancelToken(),
  );
  f.loading();
  assert.equal(f.calls.length, 0);
  await f.ready("first-webview");
  assert.equal(await pending, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.target.fragment, "Cold heading");
  assert.equal(f.calls[0]!.target.session, "first-webview");
});

test("a fresh reveal queued during reload waits for the replacement session", async (t) => {
  const f = await fixture();
  t.after(() => f.dispose());
  await f.ready("old-webview");
  f.loading();
  const pending = f.reveal.reveal(
    { fragment: "New heading", requestId: 2 },
    new CancelToken(),
  );
  assert.equal(f.calls.length, 0);
  await f.ready("replacement-webview");
  assert.equal(await pending, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.target.session, "replacement-webview");
});

for (const announced of [true, false]) {
  test(`a ${announced ? "loading event" : "replacement session"} cancels an already posted reveal RPC`, async (t) => {
    const f = await fixture();
    t.after(() => f.dispose());
    const entered = gate();
    const cancelled = gate();
    const release = gate();
    t.after(release.resolve);
    f.setNavigate(async (_target, token) => {
      token.onCancel(cancelled.resolve);
      entered.resolve();
      await release.promise;
      return !token.cancelled;
    });
    await f.ready("old-webview");
    const pending = cancelledResult(
      f.reveal.reveal(
        { fragment: "Obsolete heading", requestId: 1 },
        new CancelToken(),
      ),
    );
    await entered.promise;
    if (announced) {
      f.loading();
    } else {
      await f.ready("replacement-webview");
    }
    await cancelled.promise;
    assert.equal(f.calls[0]!.token.cancelled, true);
    release.resolve();
    assert.equal(await pending, false);
  });
}

test("a newer native intent suppresses the older reveal while the exact pane initializes", async (t) => {
  const f = await fixture();
  t.after(() => f.dispose());
  const old = f.router.deliver(f.router.begin(), "pane", {
    fragment: "Obsolete heading",
  });
  await Promise.resolve();
  const next = f.router.begin();
  f.loading();
  await f.ready("first-webview");
  assert.equal(await old, false);
  assert.equal(f.calls.length, 0);
  assert.equal(
    await f.router.deliver(next, "pane", {
      fragment: "Current heading",
    }),
    true,
  );
  assert.deepEqual(
    f.calls.map(({ target }) => target.fragment),
    ["Current heading"],
  );
});

test("an already-ready pane still navigates when unfocused (Outline / sidebar)", async (t) => {
  const f = await fixture();
  t.after(() => f.dispose());
  await f.ready("first-webview");
  f.setActive(false);
  assert.equal(
    await f.reveal.reveal(
      { fragment: "Heading from outline", requestId: 1 },
      new CancelToken(),
    ),
    true,
  );
  assert.deepEqual(
    f.calls.map(({ target }) => target.fragment),
    ["Heading from outline"],
  );
});

test("leaving the pane before readiness prevents delayed navigation", async (t) => {
  const f = await fixture();
  t.after(() => f.dispose());
  const pending = f.reveal.reveal(
    { fragment: "Old pane heading", requestId: 1 },
    new CancelToken(),
  );
  f.setActive(false);
  await f.ready("first-webview");
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 0);
});

test("disposing the links owner releases an unready pending reveal", async () => {
  const f = await fixture();
  const pending = f.reveal.reveal(
    { fragment: "Closed pane heading", requestId: 1 },
    new CancelToken(),
  );
  await f.dispose();
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 0);
});
