import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { fileVaultTrust, readAnswers } from "../../src/server/vault-trust";

async function store(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-trust-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "trust.json");
  const trust = fileVaultTrust(file);
  await trust.load();
  return { trust, file };
}

const VAULT = "/Users/someone/Field Notes";
const ROOT = pathToFileURL(VAULT).href;

test("every note in a vault asks, and the owner is asked once", async (t) => {
  const { trust } = await store(t);
  let questionChanges = 0;
  trust.onQuestionsChange(() => questionChanges++);
  assert.equal(trust.answer(ROOT), undefined);
  const first = trust.request(ROOT, ["dataview"]);
  const second = trust.request(ROOT, ["calendar", "dataview"]);
  assert.deepEqual(trust.questions(), [
    { vault: VAULT, plugins: ["dataview", "calendar"] },
  ]);
  assert.equal(questionChanges, 2);

  let changes = 0;
  trust.onDidChange(() => changes++);
  await trust.decide(VAULT, true);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(trust.questions(), []);
  assert.equal(trust.answer(ROOT), true);
  assert.equal(changes, 1);
  assert.equal(await trust.request(ROOT, ["dataview"]), true);
  assert.deepEqual(trust.questions(), [], "an allowed vault is not asked");
});

test("answers are kept, and a vault that was refused can be asked again", async (t) => {
  const { trust, file } = await store(t);
  const refused = trust.request(ROOT, ["dataview"]);
  await trust.decide(VAULT, false);
  assert.equal(await refused, false);

  const reloaded = fileVaultTrust(file);
  await reloaded.load();
  assert.equal(reloaded.answer(ROOT), false);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    vaults: { [VAULT]: false },
  });

  const again = reloaded.request(ROOT, []);
  assert.deepEqual(reloaded.questions(), [{ vault: VAULT, plugins: [] }]);
  await reloaded.decide(VAULT, true);
  assert.equal(await again, true);
});

test("only a vault that asked can be answered", async (t) => {
  const { trust } = await store(t);
  await assert.rejects(trust.decide(VAULT, true), /No question/);
  assert.equal(trust.answer(ROOT), undefined);
});

test("a damaged answers file reads as no answers", () => {
  assert.deepEqual(readAnswers(null), new Map());
  assert.deepEqual(readAnswers({ vaults: [] }), new Map());
  assert.deepEqual(
    readAnswers({ vaults: { "/a": true, "/b": "yes" } }),
    new Map([["/a", true]]),
  );
});
