// A note's page reads only files in a vault the window has open that holds
// its note; the page is not trusted, so every URI is checked again here.
import test from "node:test";
import assert from "node:assert/strict";
import { fileUri } from "@workshop/host-node/core";
import { MemoryFileSystem, Mounts } from "@workshop/host-web";
import { vaultFile, type VaultFilesParts } from "../../src/vault-files";

const NOTE = fileUri("/vaults/Notes/Welcome.md");

/** Two vaults open, the window's data, and a vault mounted but not open. */
function window(): VaultFilesParts {
  const files = new Mounts();
  files.mount(
    "/vaults/Notes",
    new MemoryFileSystem({
      "Welcome.md": "# Welcome",
      "Attachments/a b.png": new Uint8Array([137, 80, 78, 71]),
    }),
  );
  files.mount(
    "/vaults/Notes 2",
    new MemoryFileSystem({ "secret.png": "other" }),
  );
  files.mount(
    "/vaults/Closed",
    new MemoryFileSystem({ "closed.png": "closed" }),
  );
  files.mount(
    "/lumiere-data",
    new MemoryFileSystem({ "window/trust.json": "{}" }),
  );
  return {
    panels: {
      get: (id) => (id === "p1" ? { document: { uri: NOTE } } : undefined),
    },
    vaults: () => ["/vaults/Notes", "/vaults/Notes 2"],
    files,
  };
}

test("a file in the note's vault is handed over", async () => {
  const answer = await vaultFile(window(), {
    panel: "p1",
    uri: fileUri("/vaults/Notes/Attachments/a b.png"),
  });
  assert.equal(answer.kind, "file");
  assert.deepEqual(
    new Uint8Array(await (answer as { file: Blob }).file.arrayBuffer()),
    new Uint8Array([137, 80, 78, 71]),
  );
});

test("anything outside the note's vault is refused", async () => {
  const refused = async (uri: string) =>
    assert.deepEqual(await vaultFile(window(), { panel: "p1", uri }), {
      kind: "refused",
    });
  await refused(fileUri("/lumiere-data/window/trust.json"));
  await refused(fileUri("/vaults/Notes 2/secret.png"));
  await refused(fileUri("/vaults/Closed/closed.png"));
  await refused("file:///vaults/Notes/../../lumiere-data/window/trust.json");
  await refused("file:///vaults/Notes/%2e%2e/Notes%202/secret.png");
  await refused("file:///vaults/Notes/..%2F..%2Flumiere-data%2Fwindow");
  await refused("https://example.com/a.png");
  await refused("not a uri");
});

test("a note whose vault is no longer open reads nothing", async () => {
  const parts = { ...window(), vaults: () => ["/vaults/Notes 2"] };
  assert.deepEqual(
    await vaultFile(parts, {
      panel: "p1",
      uri: fileUri("/vaults/Notes/Attachments/a b.png"),
    }),
    { kind: "refused" },
  );
});

test("no file there, or a folder, is missing; another window's panel is unknown", async () => {
  const parts = window();
  assert.deepEqual(
    await vaultFile(parts, {
      panel: "p1",
      uri: fileUri("/vaults/Notes/Attachments/none.png"),
    }),
    { kind: "missing" },
  );
  assert.deepEqual(
    await vaultFile(parts, {
      panel: "p1",
      uri: fileUri("/vaults/Notes/Attachments"),
    }),
    { kind: "missing" },
  );
  assert.deepEqual(
    await vaultFile(parts, {
      panel: "p2",
      uri: fileUri("/vaults/Notes/Attachments/a b.png"),
    }),
    { kind: "unknown" },
  );
});

test("a file that cannot be read after all is missing", async () => {
  const parts = window();
  const files = Object.assign(Object.create(parts.files) as Mounts, {
    readBlob: () => Promise.reject(new Error("The folder was revoked")),
  });
  assert.deepEqual(
    await vaultFile(
      { ...parts, files },
      { panel: "p1", uri: fileUri("/vaults/Notes/Attachments/a b.png") },
    ),
    { kind: "missing" },
  );
});
