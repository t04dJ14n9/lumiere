import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const run = (args: string[]) =>
  spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });

// `pnpm build` emits dist/api from tsconfig.api.json. An extension that
// copies those files must be able to write a typed plugin with nothing else.
test("the emitted dist/api declarations type-check a consumer on their own", () => {
  const out = mkdtempSync(path.join(tmpdir(), "mdwb-api-"));
  try {
    const emitted = run(["-p", "tsconfig.api.json", "--outDir", out]);
    assert.equal(emitted.status, 0, emitted.stdout + emitted.stderr);
    assert.deepEqual(readdirSync(out).sort(), [
      "metadata-types.d.ts",
      "plugin-types.d.ts",
      "types.d.ts",
    ]);
    const consumer = path.join(out, "consumer.ts");
    writeFileSync(
      consumer,
      [
        'import type { MarkdownWorkbenchApi, ExternalPlugin, SourceMarker } from "./types";',
        "declare const api: MarkdownWorkbenchApi;",
        "const marker: SourceMarker = { id: 'a', from: 0, to: 1, documentVersion: 1, label: 'A' };",
        "const plugin: ExternalPlugin = {",
        "  id: 'acme.badges', ownerExtensionId: 'acme.badges', title: 'Badges',",
        "  description: 'Badges', defaultEnabled: true, inject: { required: ['markers'] },",
        "  apply(ctx) { ctx.markers.set('editor', [marker]); ctx.on('links/open', () => undefined); },",
        "};",
        "export const handle = api.plugin(plugin);",
        "",
      ].join("\n"),
    );
    const checked = run([
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--moduleResolution",
      "bundler",
      "--module",
      "ESNext",
      "--types",
      "vscode",
      "--typeRoots",
      path.resolve("node_modules/@types"),
      consumer,
    ]);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
