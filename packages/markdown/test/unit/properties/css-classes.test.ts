import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { HostWorkspace } from "../../../src/shared/host";
import {
  frontmatterCssClasses,
  noteCssClasses,
} from "../../../src/markdown/properties";
import { noteCssClassesExtension } from "../../../src/plugins/properties/css-classes";
import { loadVaultCssSnippets } from "../../../src/plugins/properties/snippets";
import { applyCustomCalloutStyles } from "../../../src/plugins/callouts/webview";
import { resolveCalloutIcon } from "../../../src/webview/ui/icons";

test("frontmatterCssClasses and noteCssClasses extract sanitized tokens from cssclasses and legacy cssclass", () => {
  assert.deepEqual(
    frontmatterCssClasses({
      cssclasses: ["wide-page", "cards, compact", "cm-editor", "bad!class"],
      cssclass: "legacy-view wide-page",
    }),
    ["wide-page", "cards", "compact", "legacy-view"],
  );

  const md =
    "---\ncssclasses:\n  - custom-theme\n  - dashboard\n---\n# Heading\n";
  assert.deepEqual(noteCssClasses(md), ["custom-theme", "dashboard"]);
  assert.deepEqual(noteCssClasses("# No frontmatter\n"), []);
});

test("noteCssClassesExtension provides editorAttributes and contentAttributes and updates reactively", () => {
  let state = EditorState.create({
    doc: "---\ncssclasses:\n  - wide-page\n  - kanban\n---\nBody\n",
    extensions: [noteCssClassesExtension()],
  });
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {
    class: "wide-page kanban",
    "data-cssclasses": "wide-page kanban",
  });
  assert.deepEqual(state.facet(EditorView.contentAttributes).at(-1), {
    class: "wide-page kanban",
  });

  state = state.update({
    changes: {
      from: 0,
      to: state.doc.length,
      insert: "---\ncssclass: minimal-note\n---\nBody\n",
    },
  }).state;
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {
    class: "minimal-note",
    "data-cssclasses": "minimal-note",
  });
  assert.deepEqual(state.facet(EditorView.contentAttributes).at(-1), {
    class: "minimal-note",
  });

  state = state.update({
    changes: {
      from: 0,
      to: state.doc.length,
      insert: "# Plain note\n",
    },
  }).state;
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {});
  assert.deepEqual(state.facet(EditorView.contentAttributes).at(-1), {});
});

test("loadVaultCssSnippets honors appearance.json enabledCssSnippets or discovers .obsidian/snippets/*.css", async () => {
  const files = new Map<string, string>([
    [
      "file:///vault/.obsidian/appearance.json",
      JSON.stringify({ enabledCssSnippets: ["callouts", "../secret"] }),
    ],
    [
      "file:///vault/.obsidian/snippets/callouts.css",
      '.callout[data-callout="custom-question-type"] { --callout-color: 0, 184, 212; --callout-icon: lucide-alert-circle; }',
    ],
    [
      "file:///vault/.obsidian/snippets/extra.css",
      ".wide-page { max-width: 100%; }",
    ],
  ]);

  const workspace: HostWorkspace = {
    folders: () => ["file:///vault"],
    isTrusted: () => true,
    read: async () => new Uint8Array(),
    stat: async () => ({ mtime: 1, symbolicLink: false }),
    watch: () => () => {},
    revealTextEditor: async () => {},
    diagnostics: {
      replaceAll: () => {},
      clear: () => {},
    },
    files: {
      authorize: async () => {},
      readText: async (uri) => files.get(uri),
      writeText: async () => {},
      list: async () => ["callouts.css", "extra.css"],
      mkdir: async () => {},
      copy: async () => {},
      move: async () => {},
      remove: async () => {},
      isSymbolicLink: async () => false,
      pickFile: async () => undefined,
    },
  };

  const enabledOnly = await loadVaultCssSnippets(workspace, "file:///vault");
  assert.equal(enabledOnly.length, 1);
  assert.match(enabledOnly[0]!, /custom-question-type/);

  files.delete("file:///vault/.obsidian/appearance.json");
  const allDiscovered = await loadVaultCssSnippets(workspace, "file:///vault");
  assert.equal(allDiscovered.length, 2);
});

test("resolveCalloutIcon and applyCustomCalloutStyles resolve custom --callout-icon and normalize --callout-color", (t) => {
  assert.match(
    resolveCalloutIcon("lucide-alert-circle") ?? "",
    /data-lucide="alert-circle"/,
  );
  assert.match(
    resolveCalloutIcon("'sparkles'") ?? "",
    /data-lucide="sparkles"/,
  );
  assert.equal(resolveCalloutIcon("nonexistent-icon"), undefined);

  let replacedWith: unknown;
  const fakeIcon = {
    replaceWith(node: unknown) {
      replacedWith = node;
    },
  };
  const styleProps = new Map<string, string>();
  const fakeCallout = {
    style: {
      setProperty(name: string, val: string) {
        styleProps.set(name, val);
      },
    },
    querySelector(selector: string) {
      return selector === ":scope > .callout-title > .callout-icon"
        ? fakeIcon
        : null;
    },
  };
  const prevGetComputedStyle = Object.getOwnPropertyDescriptor(
    globalThis,
    "getComputedStyle",
  );
  const prevDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({
      getPropertyValue(prop: string) {
        if (prop === "--callout-color") {
          return "#00b8d4";
        }
        if (prop === "--callout-icon") {
          return "lucide-alert-circle";
        }
        return "";
      },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        let html = "";
        return {
          set innerHTML(val: string) {
            html = val;
          },
          get content() {
            return { firstElementChild: html };
          },
        };
      },
    },
  });
  t.after(() => {
    if (prevGetComputedStyle) {
      Object.defineProperty(
        globalThis,
        "getComputedStyle",
        prevGetComputedStyle,
      );
    } else {
      Reflect.deleteProperty(globalThis, "getComputedStyle");
    }
    if (prevDocument) {
      Object.defineProperty(globalThis, "document", prevDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  });

  applyCustomCalloutStyles({
    querySelectorAll: () => [fakeCallout],
  } as unknown as ParentNode);

  assert.equal(styleProps.get("--callout-color"), "0, 184, 212");
  assert.match(String(replacedWith), /data-lucide="alert-circle"/);
});
