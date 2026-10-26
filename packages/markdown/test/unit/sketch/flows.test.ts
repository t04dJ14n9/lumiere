import test from "node:test";
import assert from "node:assert/strict";
import { sketchFromSvg, sketchToSvg } from "@workshop/ink/format";
import { editSketch, sketchTitle } from "../../../src/plugins/sketch/edit";
import { insertSketch } from "../../../src/plugins/sketch/insert";
import type { TextEdit } from "../../../src/shared/host";
import { fakeDocument } from "../../support/vscode-fake";
import {
  drawing,
  fakeInk,
  memoryFiles,
  pressedStroke,
  sketchHost,
  uriOf,
  vaultOf,
} from "./support";

const NOW = new Date(2026, 9, 22, 14, 3);

function note(text: string, caret?: number) {
  return {
    document: fakeDocument({
      uri: uriOf("Projects/Plan.md"),
      getText: () => text,
    }),
    ...(caret === undefined ? {} : { caret }),
    links: {
      attachmentFolder: "Attachments",
      useWikilinks: true,
      format: "shortest" as const,
    },
  };
}

function insertHost(ink: ReturnType<typeof fakeInk>["ink"], paths: string[]) {
  const disk = memoryFiles();
  const { index, vaults } = vaultOf(paths);
  const applied: TextEdit[][] = [];
  const host = {
    ...sketchHost({ ink, files: disk.api, vaults }),
    apply: async (_document: unknown, edits: readonly TextEdit[]) => {
      applied.push([...edits]);
      return true;
    },
    now: () => NOW,
  };
  return { host, disk, index, applied };
}

test("Insert Sketch saves the drawing, with its pressure, and embeds it at the caret", async () => {
  const { ink, requests } = fakeInk(drawing());
  const { host, disk, applied } = insertHost(ink, ["Projects/Plan.md"]);

  const saved = await insertSketch(host, note("Plan\n\nMore", 2));

  assert.equal(saved, "Attachments/2026-10-22 14.03.sketch.svg");
  assert.deepEqual(requests, [{ title: "2026-10-22 14.03" }]);
  assert.ok(disk.folders.has(uriOf("Attachments")), "the folder is made");
  const svg = disk.files.get(uriOf(saved!));
  assert.ok(svg);
  const stored = sketchFromSvg(svg);
  assert.deepEqual(
    stored.strokes[0]!.points.map((point) => point.width),
    pressedStroke().points.map((point) => point.width),
  );
  assert.deepEqual(applied, [
    [
      {
        from: 4,
        to: 4,
        insert: "\n\n![[2026-10-22 14.03.sketch.svg]]",
      },
    ],
  ]);
  assert.deepEqual(host.errors, []);
});

test("a second sketch in the same minute gets a name of its own", async () => {
  const { ink } = fakeInk(drawing());
  const { host, disk } = insertHost(ink, ["Projects/Plan.md"]);
  disk.files.set(uriOf("Attachments/2026-10-22 14.03.sketch.svg"), "<svg/>");

  const saved = await insertSketch(host, note("Plan"));

  assert.equal(saved, "Attachments/2026-10-22 14.03 2.sketch.svg");
});

test("the embed names the folder when another file has the sketch's name", async () => {
  const { ink } = fakeInk(drawing());
  const { host, applied } = insertHost(ink, [
    "Projects/Plan.md",
    "Old/2026-10-22 14.03.sketch.svg",
  ]);

  await insertSketch(host, note("Plan"));

  assert.equal(
    applied[0]![0]!.insert,
    "\n\n![[Attachments/2026-10-22 14.03.sketch.svg]]\n",
  );
});

test("cancelling the canvas writes nothing and leaves the note alone", async () => {
  const { ink } = fakeInk(undefined);
  const { host, disk, applied } = insertHost(ink, ["Projects/Plan.md"]);

  assert.equal(await insertSketch(host, note("Plan")), undefined);
  assert.equal(disk.files.size, 0);
  assert.deepEqual(applied, []);
});

test("a canvas that cannot open is reported, and nothing is written", async () => {
  const { ink } = fakeInk(new Error("A canvas is already open."));
  const { host, disk } = insertHost(ink, ["Projects/Plan.md"]);

  assert.equal(await insertSketch(host, note("Plan")), undefined);
  assert.equal(disk.files.size, 0);
  assert.deepEqual(host.errors, [
    "The canvas could not open: A canvas is already open.",
  ]);
});

test("a note outside a vault gets no sketch", async () => {
  const { ink, requests } = fakeInk(drawing());
  const host = {
    ...sketchHost({ ink, vaults: { locate: async () => undefined } }),
    apply: async () => true,
    now: () => NOW,
  };

  assert.equal(await insertSketch(host, note("Plan")), undefined);
  assert.deepEqual(requests, [], "no canvas for a sketch it could not save");
  assert.equal(host.errors.length, 1);
});

test("tapping a sketch opens it as drawn and saves the new drawing over it", async () => {
  const path = "Attachments/2026-10-22 14.03.sketch.svg";
  const before = drawing();
  const after = drawing([pressedStroke(), pressedStroke()]);
  const disk = memoryFiles({ [uriOf(path)]: sketchToSvg(before) });
  const { ink, requests } = fakeInk(after);
  const host = sketchHost({
    ink,
    files: disk.api,
    vaults: vaultOf(["Projects/Plan.md", path]).vaults,
  });

  const saved = await editSketch(host, uriOf("Projects/Plan.md"), {
    target: "2026-10-22 14.03.sketch.svg",
    syntax: "wikilink",
  });

  assert.equal(saved, true);
  assert.equal(requests[0]!.title, "2026-10-22 14.03");
  assert.deepEqual(requests[0]!.sketch, sketchFromSvg(sketchToSvg(before)));
  assert.equal(
    sketchFromSvg(disk.files.get(uriOf(path))!).strokes.length,
    after.strokes.length,
  );
});

test("a Markdown image link to a sketch opens it too", async () => {
  const path = "Attachments/2026-10-22 14.03.sketch.svg";
  const disk = memoryFiles({ [uriOf(path)]: sketchToSvg(drawing()) });
  const { ink, requests } = fakeInk(undefined);
  const host = sketchHost({
    ink,
    files: disk.api,
    vaults: vaultOf(["Projects/Plan.md", path]).vaults,
  });

  const saved = await editSketch(host, uriOf("Projects/Plan.md"), {
    target: "../Attachments/2026-10-22%2014.03.sketch.svg",
    syntax: "markdown",
  });

  assert.equal(saved, false, "cancelled");
  assert.equal(requests.length, 1);
  assert.equal(disk.files.get(uriOf(path)), sketchToSvg(drawing()));
});

test("only sketches open: other images, missing files and foreign SVGs do not", async () => {
  const disk = memoryFiles({
    [uriOf("photo.png")]: "png",
    [uriOf("drawn elsewhere.sketch.svg")]:
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
  });
  const { ink, requests } = fakeInk();
  const host = sketchHost({
    ink,
    files: disk.api,
    vaults: vaultOf(["Plan.md", "photo.png", "drawn elsewhere.sketch.svg"])
      .vaults,
  });
  for (const target of ["photo.png", "missing.sketch.svg"]) {
    assert.equal(
      await editSketch(host, uriOf("Plan.md"), { target, syntax: "wikilink" }),
      false,
    );
  }
  assert.equal(
    await editSketch(host, uriOf("Plan.md"), {
      target: "drawn elsewhere.sketch.svg",
      syntax: "wikilink",
    }),
    false,
  );
  assert.deepEqual(requests, []);
  assert.equal(host.errors.length, 1);
  assert.match(
    host.errors[0]!,
    /drawn elsewhere\.sketch\.svg cannot be edited/,
  );
});

test("the canvas's title is the sketch's name", () => {
  assert.equal(
    sketchTitle("A/2026-10-22 14.03.sketch.svg"),
    "2026-10-22 14.03",
  );
  assert.equal(sketchTitle("A/Plan.SKETCH.SVG"), "Plan");
});

test("a sketch embedded with a Markdown link opens again from that link", async () => {
  const { ink, requests } = fakeInk(drawing(), undefined);
  const { host, index, applied } = insertHost(ink, ["Projects/Plan.md"]);
  const markdown = {
    ...note("Plan"),
    links: {
      attachmentFolder: "",
      useWikilinks: false,
      format: "relative" as const,
    },
  };

  const saved = await insertSketch(host, markdown);
  index.upsertFile({ path: saved!, uri: uriOf(saved!), mtime: 1, size: 1 });
  const embed = /!\[\]\((.+)\)/.exec(applied[0]![0]!.insert)![1]!;

  assert.equal(embed, "../2026-10-22%2014.03.sketch.svg");
  assert.equal(
    await editSketch(host, uriOf("Projects/Plan.md"), {
      target: embed,
      syntax: "markdown",
    }),
    false,
  );
  assert.equal(requests.length, 2, "the canvas opened on it");
  assert.equal(requests[1]!.title, "2026-10-22 14.03");
});
