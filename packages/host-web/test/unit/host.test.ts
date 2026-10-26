import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { silentLogger } from "@workshop/core";
import { startHost } from "@workshop/host-node/core";
import { nodeWorkerLauncher } from "@workshop/markdown/node";
import type { ContributedSetting } from "@workshop/markdown/portable";
import { MemoryFileSystem } from "../../src/memory-fs";
import { Mounts } from "../../src/mounts";
import { openEditorPage } from "../../src/pages";
import { createWebPlatform } from "../../src/platform";

const MARKDOWN = path.resolve(import.meta.dirname, "../../../markdown");
const WORKERS = path.join(MARKDOWN, "dist", "workers");
const ROOT = "/vaults/Notes";

/** Lumière's contributed settings, as the build writes them. */
function contributed(): ContributedSetting[] {
  const configuration = JSON.parse(
    readFileSync(path.join(MARKDOWN, "../../package.json"), "utf8"),
  ).contributes.configuration as {
    properties?: Record<string, { default?: unknown }>;
  }[];
  return configuration.flatMap((section) =>
    Object.entries(section.properties ?? {}).map(([key, schema]) => ({
      key,
      schema: schema as ContributedSetting["schema"],
    })),
  );
}

test(
  "the plugins start on an in-memory vault, open a note's page and keep settings in the store",
  { skip: !existsSync(WORKERS) && "the editor is not built" },
  async () => {
    const files = new Mounts();
    files.mount(
      ROOT,
      new MemoryFileSystem({
        "Welcome.md": "# Welcome\n\nSee [[Other]].",
        "Other.md": "# Other\n\nBack to [[Welcome]].",
      }),
    );
    const data = new MemoryFileSystem();
    files.mount("/lumiere-data", data);
    const host = await startHost(
      createWebPlatform({
        files,
        dataRoot: "/lumiere-data",
        workers: nodeWorkerLauncher(WORKERS),
      }),
      {
        identity: { appName: "Lumière", uriScheme: "lumiere" },
        contributed: contributed(),
        logger: silentLogger,
      },
    );
    try {
      const page = await openEditorPage(
        host,
        {
          uri: pathToFileURL(`${ROOT}/Welcome.md`).href,
          root: pathToFileURL(ROOT).href,
        },
        {
          origin: "https://lumiere.example",
          editor: "https://lumiere.example/markdown/",
          shim: "https://lumiere.example/page/shim.js",
          pdf: {
            viewer: "https://lumiere.example/pdf/",
            shim: "https://lumiere.example/page/pdf-shim.js",
          },
          resource: () => "",
        },
      );
      const html = await (await fetch(page.url)).text();
      assert.match(
        html,
        /https:\/\/lumiere\.example\/markdown\/webview\/editor\.js/,
      );
      assert.ok(host.panels.get(page.id), "the page has a panel");

      await host.settings.access.update("editor.readableLineLength", false);
      assert.deepEqual(
        JSON.parse(new TextDecoder().decode(await data.read("settings.json"))),
        { "lumiere.markdown.editor.readableLineLength": false },
      );
      page.dispose();
    } finally {
      await host.stop();
    }
  },
);
