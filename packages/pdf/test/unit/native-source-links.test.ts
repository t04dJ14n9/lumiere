import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";
import path from "node:path";
import { driver } from "./support/native-links-fake";
import { nodeDigests } from "@workshop/platform/node";
const resolver = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...rest) {
  return request === "vscode"
    ? path.join(import.meta.dirname, "support/native-links-fake.ts")
    : resolve.call(this, request, ...rest);
};
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function setup(
  authorize: () => Promise<void> = async () => {},
  opening: () => Promise<void> = async () => {},
) {
  const { registerSourceLinks } =
    await import("../../src/extension/plugins/pdf/source-links");
  driver.reset();
  const opened: string[] = [];
  const registration = registerSourceLinks({
    digests: nodeDigests,
    command: "native.test",
    accepts: () => true,
    authorize,
    begin() {
      let cancelled = false;
      return {
        current: () => !cancelled,
        cancel: () => {
          cancelled = true;
        },
      };
    },
    async open(target, _root, _column, run) {
      await opening();
      if (run.current()) {
        opened.push(target.fragment);
      }
    },
  });
  return { opened, registration };
}
test("latest click wins a gated preflight and releases every listener", async () => {
  const blocked = gate();
  const { opened, registration } = await setup(() => blocked.promise);
  try {
    const [one, two] = await driver.tickets();
    const first = driver.invoke(one!);
    await Promise.resolve();
    const second = driver.invoke(two!);
    blocked.release();
    assert.deepEqual(await Promise.all([first, second]), [false, true]);
    assert.deepEqual(opened, ["two"]);
    assert.equal(driver.listeners, 0);
  } finally {
    registration.dispose();
  }
});
for (const change of [
  "tab",
  "group",
  "edit",
  "caret",
  "keyboard",
  "scroll",
] as const) {
  test(`${change} reader input retires a pending source link`, async () => {
    const blocked = gate();
    const { opened, registration } = await setup(() => blocked.promise);
    try {
      const [ticket] = await driver.tickets();
      const pending = driver.invoke(ticket!);
      await Promise.resolve();
      if (change === "tab") {
        driver.tab("other.md");
      }
      if (change === "group") {
        driver.tab("source.md", 2);
      }
      if (change === "scroll") {
        driver.scroll();
      }
      if (change === "edit") {
        driver.edit();
      }
      if (change === "caret") {
        driver.caret(0);
      }
      if (change === "keyboard") {
        driver.caret(10, 1);
      }
      blocked.release();
      assert.equal(await pending, false);
      assert.deepEqual(opened, []);
      assert.equal(driver.listeners, 0);
    } finally {
      registration.dispose();
    }
  });
}
test("matching native definition transition and initial href caret coexist", async () => {
  const blocked = gate();
  const { opened, registration } = await setup(() => blocked.promise);
  try {
    const [ticket] = await driver.tickets();
    const pending = driver.invoke(ticket!);
    await Promise.resolve();
    driver.caret(10);
    driver.tab("target.md");
    blocked.release();
    assert.equal(await pending, true);
    assert.deepEqual(opened, ["one"]);
  } finally {
    registration.dispose();
  }
});
test("unrelated departure also cancels inside asynchronous opener", async () => {
  const entered = gate();
  const blocked = gate();
  const { opened, registration } = await setup(
    async () => {},
    async () => {
      entered.release();
      await blocked.promise;
    },
  );
  try {
    const [ticket] = await driver.tickets();
    const pending = driver.invoke(ticket!);
    await entered.promise;
    driver.tab("other.md");
    blocked.release();
    assert.equal(await pending, false);
    assert.deepEqual(opened, []);
  } finally {
    registration.dispose();
  }
});
test("stale and forged tickets cannot open; missing targets report once", async () => {
  const { opened, registration } = await setup(async () => {
    throw new Error("Missing target");
  });
  try {
    const [ticket] = await driver.tickets();
    assert.equal(await driver.invoke([ticket![0], "0".repeat(64)]), false);
    assert.equal(await driver.invoke(ticket!), false);
    assert.equal(driver.warnings.length, 1);
    driver.edit();
    assert.equal(await driver.invoke(ticket!), false);
    assert.deepEqual(opened, []);
    assert.equal(driver.listeners, 0);
  } finally {
    registration.dispose();
  }
});

for (const destination of ["target.md", "other.md", "unknown"] as const) {
  test(`unknown custom-editor transition resolves safely to ${destination}`, async () => {
    const entered = gate();
    const blocked = gate();
    const { opened, registration } = await setup(
      async () => {},
      async () => {
        entered.release();
        await blocked.promise;
      },
    );
    try {
      const [ticket] = await driver.tickets();
      const pending = driver.invoke(ticket!);
      await entered.promise;
      driver.unknownTab();
      if (destination === "unknown") {
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        driver.tab(destination);
      }
      blocked.release();
      assert.equal(await pending, destination === "target.md");
      assert.deepEqual(opened, destination === "target.md" ? ["one"] : []);
      assert.equal(driver.listeners, 0);
    } finally {
      registration.dispose();
    }
  });
}

for (const destination of ["target.md", "other.md", "unknown"] as const) {
  test(`preflight finishing during an unknown tab waits safely for ${destination}`, async () => {
    const blocked = gate();
    const { opened, registration } = await setup(() => blocked.promise);
    try {
      const [ticket] = await driver.tickets();
      const pending = driver.invoke(ticket!);
      await Promise.resolve();
      driver.unknownTab();
      blocked.release();
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (destination !== "unknown") {
        driver.tab(destination);
      }
      assert.equal(await pending, destination === "target.md");
      assert.deepEqual(opened, destination === "target.md" ? ["one"] : []);
      assert.equal(driver.listeners, 0);
    } finally {
      registration.dispose();
    }
  });
}
