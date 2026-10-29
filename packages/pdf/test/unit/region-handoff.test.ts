import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
// First: everything below imports 'vscode', which this points at the fake.
import "./support/install-fake-vscode";
import * as vscode from "./support/fake-vscode";
import { AgentHandoff } from "../../src/extension/plugins/agentBridge/handoff";
import type { PdfPanel } from "../../src/extension/plugins/pdf/panel";
import type { SelectionSnapshot } from "../../src/host/viewer/selection";
import { RegionImages } from "../../src/extension/plugins/pdfRegions/region-images";
import { RegionSnapshots } from "../../src/extension/plugins/pdfRegions/region-snapshots";

/**
 * Copy Link for Agent with a region snapshot over the cache cap: the snapshot
 * is neither saved nor allowed to evict others, and the agent still gets
 * the location (page and view rectangle), the region's text and a warning.
 */

const CAP = 1_000;
const png = (seed: number, size: number): string =>
  `data:image/png;base64,${Buffer.alloc(size, seed).toString("base64")}`;

let folder: string;
let clipboard: string[];
let warnings: string[];
const original = {
  writeText: vscode.env.clipboard.writeText,
  showWarningMessage: vscode.window.showWarningMessage,
  asRelativePath: vscode.workspace.asRelativePath,
};

beforeEach(async () => {
  folder = path.join(
    await mkdtemp(path.join(tmpdir(), "region-handoff-")),
    "regions",
  );
  clipboard = [];
  warnings = [];
  vscode.env.clipboard.writeText = async (text: string) => {
    clipboard.push(text);
    return undefined;
  };
  vscode.window.showWarningMessage = async (message: string) => {
    warnings.push(message);
    return undefined;
  };
  vscode.workspace.asRelativePath = () => "papers/attention.pdf";
});
afterEach(async () => {
  vscode.env.clipboard.writeText = original.writeText;
  vscode.window.showWarningMessage = original.showWarningMessage;
  vscode.workspace.asRelativePath = original.asRelativePath;
  await rm(path.dirname(folder), { recursive: true, force: true });
});

function regionPanel(image: string): PdfPanel {
  const snapshot: SelectionSnapshot = {
    selection: {
      kind: "region",
      page: 9,
      rect: [92, 126, 519, 387],
      text: "base 6 512 2048",
    },
    sha256: "9f86d0",
    selectedAt: "2026-10-11T12:00:00.000Z",
    image,
  };
  const panel = {
    uri: vscode.Uri.file("/work/papers/attention.pdf"),
    selectionSnapshot: () => snapshot,
  };
  return panel as unknown as PdfPanel;
}

async function folderContents(): Promise<Record<string, string>> {
  const names = (await readdir(folder)).sort();
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        (await readFile(path.join(folder, name))).toString("base64"),
      ]),
    ),
  );
}

test("a region snapshot over the cap is not saved and evicts nothing, but the link keeps page, region and text", async () => {
  const images = new RegionImages(folder, () => CAP);
  // Two snapshots already in the cache, together near the cap.
  await images.save("/work/papers/attention.pdf", 1, png(1, 400));
  await images.save("/work/papers/attention.pdf", 2, png(2, 400));
  const before = await folderContents();
  assert.equal(Object.keys(before).length, 2);

  const handoff = new AgentHandoff(() => new RegionSnapshots(images));
  assert.equal(
    await handoff.copyLinkForAgent(regionPanel(png(3, CAP + 1))),
    true,
  );

  // Nothing saved, nothing evicted: the cache folder is byte-for-byte the same.
  assert.deepEqual(await folderContents(), before);

  assert.equal(clipboard.length, 1);
  const text = clipboard[0]!;
  assert.equal(
    text,
    [
      "[attention.pdf · p.9](papers/attention.pdf#page=9&viewrect=92,126,427,261)",
      "",
      "> base 6 512 2048",
    ].join("\n"),
  );
  assert.doesNotMatch(
    text,
    /Source:|SHA-256|Selected PDF region|Region image/u,
  );
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0]!,
    /^The region snapshot is .* MB, more than the .* MB snapshot limit \(lumiere\.pdf\.regionImageCache\.maxSizeMB\), so it was not attached\./u,
  );
});

test("the MCP snapshot of an over-cap region has the same link and text, without a warning", async () => {
  const images = new RegionImages(folder, () => CAP);
  const handoff = new AgentHandoff(() => new RegionSnapshots(images));
  const snapshot = await handoff.snapshot(regionPanel(png(3, CAP + 1)));
  assert.ok(snapshot);
  assert.equal(snapshot.regionImage, undefined);
  assert.equal("regionImage" in snapshot, false);
  assert.match(snapshot.agentText, /#page=9&viewrect=92,126,427,261\)/u);
  assert.match(snapshot.agentText, /base 6 512 2048/u);
  assert.deepEqual(warnings, []);
  await assert.rejects(readdir(folder), { code: "ENOENT" });
});
