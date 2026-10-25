import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDiv } from "../../../src/plugins/obsidianCompat/dom-helpers";
import {
  getLanguage,
  moment,
} from "../../../src/plugins/obsidianCompat/obsidian-core";
import { MarkdownPreviewRenderer } from "../../../src/plugins/obsidianCompat/obsidian-workspace";
import { ObsidianRuntime } from "../../../src/plugins/obsidianCompat/runtime";

const REAL_PLUGINS_DIR = "/tmp/obsidian-real-plugins";
const hasRealPlugins =
  fs.existsSync(path.join(REAL_PLUGINS_DIR, "dataview/main.js")) &&
  fs.existsSync(path.join(REAL_PLUGINS_DIR, "admonitions/main.js")) &&
  fs.existsSync(path.join(REAL_PLUGINS_DIR, "tasks/main.js")) &&
  fs.existsSync(path.join(REAL_PLUGINS_DIR, "outliner/main.js")) &&
  fs.existsSync(path.join(REAL_PLUGINS_DIR, "advanced-tables/main.js"));

test("moment provides prototype instanceof, date math, formatting, and getLanguage()", () => {
  const runtime = new ObsidianRuntime();
  assert.equal(getLanguage(), "en");
  assert.equal(moment.locale(), "en");

  const m = moment("2026-10-24T09:30:00.000Z");
  assert.equal(m instanceof (moment as unknown as new () => object), true);
  assert.equal(moment.isMoment(m), true);
  assert.equal(m.isValid(), true);
  assert.equal(m.utc().format("[Year:] YYYY-MM-DD"), "Year: 2026-10-24");

  const nextDay = m.clone().add(1, "day");
  assert.equal(nextDay.isAfter(m), true);
  assert.equal(m.isBefore(nextDay), true);
  assert.equal(nextDay.diff(m, "days"), 1);
  assert.equal(moment.duration(2, "hours").asMinutes(), 120);
  runtime.dispose();
});

test("Obsidian stdlib extensions, DOM helpers, and strict-mode Blob Web Workers", async () => {
  const runtime = new ObsidianRuntime();
  const s = "hello {0}" as unknown as {
    contains: (sub: string) => boolean;
    format: (...args: string[]) => string;
  };
  assert.equal(s.contains("hello"), true);
  assert.equal(s.format("world"), "hello world");

  const arr = [1, 2, 2, 3] as unknown as {
    contains: (v: number) => boolean;
    first: () => number;
    last: () => number;
    unique: () => number[];
    remove: (v: number) => void;
  };
  assert.equal(arr.contains(2), true);
  assert.equal(arr.first(), 1);
  assert.equal(arr.last(), 3);
  assert.deepEqual(arr.unique(), [1, 2, 3]);

  const div = createDiv();
  (div as unknown as { appendText: (t: string) => void }).appendText("alpha");
  assert.equal(div.textContent, "alpha");
  assert.equal(
    (div as unknown as { instanceOf: (c: unknown) => boolean }).instanceOf(
      HTMLElement,
    ),
    true,
  );
  const code = div.createEl("code", { text: "= this.owner" });
  const list = div.querySelectorAll("code");
  assert.equal(list.item(0), code);

  const workerSrc = `"use strict";(()=>{onmessage=async e=>{postMessage({path:e.data.path,ok:true})}})();`;
  const url = URL.createObjectURL(
    new Blob([workerSrc], { type: "application/javascript" }),
  );
  const worker = new Worker(url);
  const reply = await new Promise<{ path: string; ok: boolean }>((resolve) => {
    worker.onmessage = (evt: MessageEvent) =>
      resolve(evt.data as { path: string; ok: boolean });
    worker.postMessage({ path: "projects/alpha.md" });
  });
  assert.deepEqual(reply, { path: "projects/alpha.md", ok: true });
  worker.terminate();
  runtime.dispose();
});

test("MarkdownPreviewRenderer.unregisterCodeBlockPostProcessor and app.metadataTypeManager", () => {
  const runtime = new ObsidianRuntime();
  const cb = MarkdownPreviewRenderer.registerCodeBlockPostProcessor(
    "ad-custom",
    () => {},
  );
  assert.equal(MarkdownPreviewRenderer.getPostProcessors().includes(cb), true);
  MarkdownPreviewRenderer.unregisterCodeBlockPostProcessor("ad-custom");
  assert.equal(MarkdownPreviewRenderer.getPostProcessors().includes(cb), false);
  assert.equal(
    typeof runtime.app.metadataTypeManager.getAllProperties() === "object",
    true,
  );
  runtime.dispose();
});

test(
  "loads and executes real Dataview, Admonitions, Tasks, Outliner, and Advanced Tables bundles",
  { skip: !hasRealPlugins },
  async () => {
    const runtime = new ObsidianRuntime();
    runtime.setTrusted(true);
    runtime.syncVaultFiles([
      {
        path: "projects/alpha.md",
        mtime: 1700000000000,
        size: 160,
        content:
          "---\nstatus: active\npriority: 1\ntags: [work, project]\n---\n# Alpha Project\nowner:: Alice\n- [ ] Write specs\n- [x] Ship prototype\n",
      },
      {
        path: "projects/beta.md",
        mtime: 1700000005000,
        size: 140,
        content:
          "---\nstatus: done\npriority: 2\ntags: [project]\n---\n# Beta Project\nowner:: Bob\n- [ ] Review PR\n",
      },
    ]);

    const pluginDirs = [
      "dataview",
      "advanced-tables",
      "outliner",
      "admonitions",
      "tasks",
    ];
    for (const dir of pluginDirs) {
      const p = path.join(REAL_PLUGINS_DIR, dir);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(p, "manifest.json"), "utf8"),
      );
      const mainJs = fs.readFileSync(path.join(p, "main.js"), "utf8");
      const stylesPath = path.join(p, "styles.css");
      const stylesCss = fs.existsSync(stylesPath)
        ? fs.readFileSync(stylesPath, "utf8")
        : undefined;
      const inst = await runtime.loadPluginBundle({
        id: manifest.id,
        manifest,
        mainJs,
        ...(stylesCss ? { stylesCss } : {}),
        data: dir === "dataview" ? { enableDataviewJs: true } : {},
      });
      assert.ok(inst);
    }

    await new Promise((r) => setTimeout(r, 120));

    const tableEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "dataview",
      "TABLE status, priority, owner FROM #project SORT priority ASC",
      tableEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(tableEl.textContent?.includes("Alice"));
    assert.ok(tableEl.textContent?.includes("Bob"));

    const listEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "dataview",
      'LIST FROM #project WHERE status = "active"',
      listEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(listEl.textContent?.includes("alpha"));

    const taskEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "dataview",
      "TASK FROM #project WHERE !completed",
      taskEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(taskEl.textContent?.includes("Write specs"));
    assert.ok(taskEl.textContent?.includes("Review PR"));

    const dvjsEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "dataviewjs",
      'dv.paragraph(`Total pages: ${dv.pages("#project").length}`);',
      dvjsEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(dvjsEl.textContent?.includes("Total pages: 2"));

    const inlineEl = createDiv();
    inlineEl.createEl("code", { text: "= this.owner" });
    await runtime.runPostProcessors(inlineEl, "projects/alpha.md");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(inlineEl.textContent, "Alice");

    const adEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "ad-note",
      "title: Custom Note\nHello inside admonition!",
      adEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(adEl.textContent?.includes("Custom Note"));
    assert.ok(adEl.textContent?.includes("Hello inside admonition!"));

    const tasksEl = createDiv();
    await runtime.runCodeBlockProcessors(
      "tasks",
      "not done",
      tasksEl,
      "projects/alpha.md",
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(tasksEl.textContent?.includes("Write specs"));

    runtime.dispose();
  },
);
