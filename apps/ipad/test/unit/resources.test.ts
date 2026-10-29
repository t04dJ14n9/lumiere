// A note's images and embeds are read from the vault's folder by the app's
// router (VaultRouter.swift), at addresses made here.
import test from "node:test";
import assert from "node:assert/strict";
import { fileUri } from "@workshop/host-node/core";
import { vaultFileUrl } from "../../src/resources";

const BASE = "capacitor://localhost/";
const VAULTS = new Map([
  ["app", "/vaults/Lumière"],
  ["B1E2", "/vaults/Notes 2"],
]);

test("a vault file is read at its vault's id and its path, each part encoded", () => {
  assert.equal(
    vaultFileUrl(
      fileUri("/vaults/Lumière/Attachments/Light and growth.pdf"),
      VAULTS,
      BASE,
    ),
    "capacitor://localhost/_lumiere/vault/app/Attachments/Light%20and%20growth.pdf",
  );
  assert.equal(
    vaultFileUrl(fileUri("/vaults/Notes 2/a#b?c.png"), VAULTS, BASE),
    "capacitor://localhost/_lumiere/vault/B1E2/a%23b%3Fc.png",
  );
});

test("anything else has no address: another folder, a look-alike, not a file", () => {
  assert.equal(
    vaultFileUrl(fileUri("/lumiere-data/x.json"), VAULTS, BASE),
    undefined,
  );
  assert.equal(
    vaultFileUrl(fileUri("/vaults/Lumière 3/a.png"), VAULTS, BASE),
    undefined,
  );
  assert.equal(
    vaultFileUrl("https://example.com/a.png", VAULTS, BASE),
    undefined,
  );
});
