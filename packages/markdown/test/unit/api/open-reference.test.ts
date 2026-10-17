import test from "node:test";
import assert from "node:assert/strict";
import type { HostViews, PickItem } from "../../../src/shared/runtime";
import { parseAgentReference } from "../../../src/shared/agent-reference-input";
import { resolveReference } from "../../../src/host/api/reference-target";
import { targetRange } from "../../../src/host/api/editors";
import { SourceCoordinates } from "../../../src/shared/document/coordinates";
import { fixture } from "./fixture";
import { contributions } from "../../../scripts/contributions";
import { contributionId } from "../../../src/shared/setting-schema";

const COMMAND = contributionId("openCopiedAgentReference");

test("relative reference resolution stays inside workspace roots and escapes filenames once", async () => {
  const f = await fixture();
  const seen: string[] = [];
  f.workshop.stat = async (value) => {
    seen.push(value);
    return { mtime: 0, symbolicLink: false };
  };
  const uri = await resolveReference(
    parseAgentReference("@notes/空 格 %2e%2e #draft.md#1"),
    f.workshop,
    f.platform,
  );
  assert.equal(
    uri?.toString(),
    "file:///vault/notes/%E7%A9%BA%20%E6%A0%BC%20%252e%252e%20%23draft.md",
  );
  assert.deepEqual(seen, [uri?.toString()]);
  f.workshop.workspaceFolders = () => [];
  await assert.rejects(
    resolveReference(parseAgentReference("@Note.md#1"), f.workshop, f.platform),
    /workspace folder/,
  );
  await f.dispose();
});

test("full URIs bypass relative lookup without dropping remote authority or query", async () => {
  const f = await fixture();
  f.workshop.workspaceFolders = () => [];
  f.workshop.stat = async () => {
    throw new Error("must not resolve a full URI as a relative path");
  };
  const value = "vscode-remote://ssh-remote+dev/notes/Note.md?revision=pinned";
  const uri = await resolveReference(
    parseAgentReference(`@${value}#1-2`),
    f.workshop,
    f.platform,
  );
  assert.equal(uri?.toString(), value);
  for (const invalid of [
    "@file:///report.pdf#1",
    "@command:doSomething#1",
    "@file:Note.md#1",
  ]) {
    await assert.rejects(
      resolveReference(parseAgentReference(invalid), f.workshop, f.platform),
      /Markdown file|absolute URI/,
    );
  }
  await f.dispose();
});

test("relative references use the native symlink containment guard before lookup", async () => {
  const f = await fixture();
  const checked: string[][] = [];
  f.platform.assertContained = async (root, target) => {
    checked.push([root.toString(), target.toString()]);
    throw new Error("Link symlink escapes the vault");
  };
  f.workshop.stat = async () => {
    throw new Error("must not inspect outside the workspace");
  };
  await assert.rejects(
    resolveReference(
      parseAgentReference("@link/Note.md#1"),
      f.workshop,
      f.platform,
    ),
    /symlink escapes/,
  );
  assert.deepEqual(checked, [["file:///vault", "file:///vault/link/Note.md"]]);
  await f.dispose();
});

test("multi-root duplicate paths require a choice and cancellation opens nothing", async () => {
  const f = await fixture();
  f.workshop.workspaceFolders = () => ["file:///first", "file:///second"];
  let choices: readonly PickItem<unknown>[] = [];
  f.workshop.views = {
    pick: async (options: Parameters<HostViews["pick"]>[0]) => {
      choices = options.items("");
      assert.equal(options.items("second").length, 1);
      return undefined;
    },
  } as unknown as HostViews;
  const reference = parseAgentReference("@Note.md#1");
  assert.equal(
    await resolveReference(reference, f.workshop, f.platform),
    undefined,
  );
  assert.deepEqual(
    choices.map((item) => item.description),
    ["file:///first", "file:///second"],
  );
  f.workshop.views.pick = async (options) => ({
    item: options.items("")[1]!,
    query: "",
  });
  assert.equal(
    (await resolveReference(reference, f.workshop, f.platform))?.toString(),
    "file:///second/Note.md",
  );
  f.workshop.stat = async (uri) => {
    if (uri.startsWith("file:///first/")) {
      throw new Error("not found");
    }
    return { mtime: 0, symbolicLink: false };
  };
  f.workshop.views.pick = async () => {
    throw new Error("only one candidate needs no picker");
  };
  assert.equal(
    (await resolveReference(reference, f.workshop, f.platform))?.toString(),
    "file:///second/Note.md",
  );
  f.workshop.stat = async () => {
    throw new Error("not found");
  };
  await assert.rejects(
    resolveReference(reference, f.workshop, f.platform),
    /not found/,
  );
  await f.dispose();
});

test("inclusive line targets are LF-normalized after CRLF source mapping and reject invalid ranges", () => {
  const coordinates = new SourceCoordinates("one\r\ntwo\r\nthree");
  assert.deepEqual(targetRange(coordinates, { startLine: 2, endLine: 3 }), {
    from: 4,
    to: 13,
  });
  assert.deepEqual(targetRange(coordinates, { startLine: 2, endLine: 2 }), {
    from: 4,
    to: 7,
  });
  for (const [startLine, endLine] of [
    [0, 1],
    [2, 1],
    [1, 4],
    [1.5, 2],
    [1, Number.MAX_SAFE_INTEGER + 1],
  ]) {
    assert.throws(
      () =>
        targetRange(coordinates, { startLine: startLine!, endLine: endLine! }),
      { code: "InvalidArgument" },
    );
  }
});

test("a multi-root choice rechecks containment and workspace membership after the prompt", async () => {
  const f = await fixture();
  const roots = ["file:///first", "file:///second"];
  f.workshop.workspaceFolders = () => roots;
  let replaced = false;
  f.platform.assertContained = async () => {
    if (replaced) {
      throw new Error("Link symlink escapes the vault");
    }
  };
  f.workshop.views!.pick = async (options) => {
    replaced = true;
    return { item: options.items("")[1]!, query: "" };
  };
  const reference = parseAgentReference("@Note.md#1");
  await assert.rejects(
    resolveReference(reference, f.workshop, f.platform),
    /symlink escapes/,
  );
  replaced = false;
  f.workshop.views!.pick = async (options) => {
    roots.pop();
    return { item: options.items("")[1]!, query: "" };
  };
  await assert.rejects(
    resolveReference(reference, f.workshop, f.platform),
    /no longer open/,
  );
  await f.dispose();
});

test("Open Copied Agent Reference prefills only the reference and waits for readiness and pending edits", async () => {
  const f = await fixture();
  const errors: string[] = [];
  f.workshop.error = (message) => errors.push(message);
  f.workshop.clipboard.read = async () => "@Note.md#2-3\n\n> two\n> three";
  f.workshop.views!.input = async (options) => {
    assert.equal(options.value, "@Note.md#2-3");
    assert.equal(options.validate(options.value), undefined);
    assert.match(options.validate("@Note.md#0")!, /Use/);
    return options.value;
  };
  let ready!: () => void;
  f.panels[0] = {
    ...f.panels[0]!,
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
  };
  let flushes = 0;
  f.panel.session.flush = async () => {
    flushes++;
    f.state.text = "longer first\r\ntwo\r\nthree";
  };
  const running = f.commands.get(COMMAND)!();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(flushes, 0);
  assert.equal(f.reveals.length, 0);
  ready();
  await running;
  assert.equal(flushes, 1);
  assert.deepEqual(f.reveals.pop(), {
    from: 13,
    to: 22,
    focus: true,
    version: f.panel.session.version,
  });
  assert.deepEqual(errors, []);
  await f.dispose();
  assert.equal(f.commands.has(COMMAND), false);
});

test("reference command cancellation and invalid input do not open a note", async () => {
  const f = await fixture();
  let opened = 0;
  const errors: string[] = [];
  f.workshop.error = (message) => errors.push(message);
  f.platform.open = async () => {
    opened++;
  };
  f.workshop.clipboard.read = async () => "unrelated clipboard text";
  f.workshop.views!.input = async (options) => {
    assert.equal(options.value, "");
    return undefined;
  };
  await f.commands.get(COMMAND)!();
  assert.equal(opened, 0);
  assert.deepEqual(errors, []);
  f.workshop.views!.input = async () => "@../outside.md#1";
  await f.commands.get(COMMAND)!();
  assert.equal(opened, 0);
  assert.equal(errors.length, 1);
  await f.dispose();
});

test("Open Copied Agent Reference is available without an active editor in every preset", async () => {
  const generated = await contributions();
  assert.ok(generated.commands.some((item) => item.command === COMMAND));
  const menu = generated.menus.commandPalette.find(
    (item) => item.command === COMMAND,
  );
  assert.ok(menu);
  assert.equal("when" in menu, false);
});

test("a rejected symlink candidate does not hide a contained match in another root", async () => {
  const f = await fixture();
  f.workshop.workspaceFolders = () => ["file:///first", "file:///second"];
  f.platform.assertContained = async (root) => {
    if (root.toString() === "file:///first") {
      throw new Error("symlink escapes");
    }
  };
  const seen: string[] = [];
  f.workshop.stat = async (target) => {
    seen.push(target);
    return { mtime: 0, symbolicLink: false };
  };
  const result = await resolveReference(
    parseAgentReference("@link/Note.md#1"),
    f.workshop,
    f.platform,
  );
  assert.equal(result?.toString(), "file:///second/link/Note.md");
  assert.deepEqual(seen, ["file:///second/link/Note.md"]);
  await f.dispose();
});
