import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const ANNOTATE_COMMANDS = [
  "lumiere.pdf.selectAnnotateTool",
  "lumiere.pdf.toggleAnnotateTool",
  "lumiere.pdf.pickAnnotationTool",
  "lumiere.pdf.pickAnnotationColor",
  "lumiere.pdf.annotationUndo",
  "lumiere.pdf.annotationRedo",
  "lumiere.pdf.annotationRetrySave",
] as const;

function source(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

test("the viewer does not mount an in-viewer annotation bar", () => {
  const viewer = source("src/webview/viewer.tsx");
  assert.doesNotMatch(viewer, /AnnotationChromeBar/);
  assert.doesNotMatch(viewer, /annotation-chrome-bar/);
  assert.doesNotMatch(viewer, /AnnotationToolkit/);
  assert.equal(
    existsSync(join(root, "src/webview/annotation-toolbar.tsx")),
    false,
  );
});

test("slim and floating bars do not mount an Annotate control", () => {
  const toolbar = source("src/webview/toolbar.tsx");
  const floating = source("src/webview/floating-toolbar.tsx");
  assert.doesNotMatch(toolbar, /AnnotationToolkit/);
  assert.doesNotMatch(toolbar, /label="Annotate"/);
  assert.doesNotMatch(floating, /AnnotationToolkit/);
  assert.doesNotMatch(floating, /label="Annotate"/);
});

test("styles do not reserve a row or strip for an in-viewer annotation bar", () => {
  const base = source("src/webview/styles/base.css");
  const toolbar = source("src/webview/styles/toolbar.css");
  assert.doesNotMatch(base, /tool-annotate:not\(\.toolbar-slim\)/);
  assert.doesNotMatch(base, /annotation-chrome-bar/);
  assert.doesNotMatch(toolbar, /annotation-chrome-bar/);
  assert.doesNotMatch(toolbar, /annotation-toolkit/);
  assert.doesNotMatch(toolbar, /\.color-chip/);
});

test("annotate commands stay on the status bar, command palette, and keybinding", () => {
  const bar = source("src/extension/plugins/pdfToolbar/status-bar.ts");
  for (const id of [
    "annotate",
    "annotationTool",
    "annotationColor",
    "annotationUndo",
    "annotationRedo",
  ]) {
    assert.match(bar, new RegExp(`id: "${id}"`));
  }
  assert.doesNotMatch(bar, /in the viewer/);

  const contributes = JSON.parse(source("contributes.json")) as {
    menus: Record<string, { command: string }[]>;
    keybindings: { command: string; key: string; mac?: string }[];
  };
  const title = new Set(
    (contributes.menus["editor/title"] ?? []).map((entry) => entry.command),
  );
  const palette = new Set(
    (contributes.menus.commandPalette ?? []).map((entry) => entry.command),
  );
  for (const id of ANNOTATE_COMMANDS) {
    assert.equal(title.has(id), false, id);
    assert.equal(palette.has(id), true, id);
  }
  const binding = contributes.keybindings.find(
    (entry) => entry.key === "ctrl+alt+a",
  );
  assert.equal(binding?.command, "lumiere.pdf.toggleAnnotateTool");
  assert.equal(binding?.mac, "ctrl+cmd+a");
  assert.equal(
    contributes.keybindings.some(
      (entry) =>
        (entry.key === "ctrl+z" || entry.mac === "cmd+z") &&
        entry.command.startsWith("lumiere.pdf.annotation"),
    ),
    false,
  );
});
