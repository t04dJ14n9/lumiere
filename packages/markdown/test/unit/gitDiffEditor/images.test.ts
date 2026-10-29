import { provideHostServices } from "../../../src/shared/host";
import { fakeHost, withHost } from "../../support/vscode-fake";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import {
  sideResources,
  diffResourcesHost,
} from "../../../src/plugins/resources/diff-resources";
import { gitSource as diffSource } from "../../../src/host/git-source";
import { realContains } from "../../../src/host/real-contains";
import {
  diffImageUrl,
  diffResourceRoots,
} from "../../../src/host/diff-image-url";
import { resolveDiffImages } from "../../../src/webview/diff/images";
import {
  diffImageRequest,
  diffImageReply,
  diffUpdate,
} from "../../../src/shared/diff-panel-protocol";
import type { Vaults } from "../../../src/plugins/vault/api";

const gitUri = (path: string, ref: string) =>
  `git:${path}?${encodeURIComponent(JSON.stringify({ path, ref }))}`;

test("Git source file URIs round-trip literal percent paths and Windows drive/UNC paths", () => {
  for (const [path, source, windows] of [
    ["/vault/100% done/n.md", "file:///vault/100%25%20done/n.md", false],
    [
      "/vault/release%20notes/n.md",
      "file:///vault/release%2520notes/n.md",
      false,
    ],
    ["C:\\vault\\100% done\\n.md", "file:///C:/vault/100%25%20done/n.md", true],
    [
      "C:/vault/release%20notes/n.md",
      "file:///C:/vault/release%2520notes/n.md",
      true,
    ],
    [
      "\\\\server\\share\\release%20notes\\n.md",
      "file://server/share/release%2520notes/n.md",
      true,
    ],
  ] as const) {
    const result = diffSource(gitUri(path, "HEAD"));
    assert.deepEqual(result, { source, ref: "HEAD" });
    assert.equal(
      fileURLToPath(result.source, { windows }),
      windows ? path.replaceAll("/", "\\") : path,
    );
  }
});

for (const directory of ["100% done", "release%20notes"]) {
  test(`Git images resolve relative to the literal ${directory} directory`, async (t) => {
    const vaultPath = await mkdtemp(join(tmpdir(), "mw-diff-images-"));
    t.after(() => rm(vaultPath, { recursive: true, force: true }));
    const notePath = join(vaultPath, directory, "n.md");
    const imagePath = join(vaultPath, directory, "image.png");
    await mkdir(join(vaultPath, directory));
    await writeFile(imagePath, new Uint8Array([1]));
    const root = pathToFileURL(vaultPath).href;
    const source = pathToFileURL(notePath).href;
    const image = pathToFileURL(imagePath).href;
    const vaults = {
      async forDocument(uri: string) {
        assert.equal(uri, source);
        return {
          async settled() {},
          index: {
            root,
            resolveLink(target: string, relative: string) {
              assert.equal(target, "image.png");
              assert.equal(relative, `${directory}/n.md`);
              return { uri: image, path: `${directory}/image.png` };
            },
          },
        };
      },
    } as unknown as Vaults;
    const files = fakeHost({
      workspace: {
        async stat(uri) {
          assert.equal(uri, image);
          return { mtime: 7, symbolicLink: false };
        },
        // VS Code resolves file: links on the local disk.
        realContains,
      },
      git: {
        // VS Code's own parser: these sides are named by git: URIs.
        sourceOf: diffSource,
        toGitUri(uri, ref) {
          assert.equal(uri, image);
          assert.equal(ref, "HEAD");
          return gitUri(fileURLToPath(uri), ref);
        },
      },
    });
    const resource = await sideResources(vaults, files, {
      uri: gitUri(notePath, "HEAD"),
      label: "HEAD",
      text: "",
    });
    assert.equal(await resource.load("image.png"), gitUri(imagePath, "HEAD"));
  });
}

test("images resolve separately against each note and Git revision with existing containment", async () => {
  const resolutions: string[] = [];
  const root = "vscode-remote://host/vault";
  const source = `${root}/notes/n.md`;
  const vaults = {
    async forDocument(uri: string) {
      resolutions.push(uri);
      return {
        async settled() {},
        index: {
          root,
          resolveLink(target: string, relative: string) {
            assert.equal(relative, "notes/n.md");
            return {
              uri: `${root}/assets/${target}`,
              path: `assets/${target}`,
            };
          },
        },
      };
    },
  } as unknown as Vaults;
  const files = fakeHost({
    workspace: {
      read: async () => new Uint8Array(),
      stat: async () => ({ mtime: 7, symbolicLink: false }),
    },
    git: { sourceOf: diffSource },
  });
  const resource = await sideResources(vaults, files, {
    uri: source,
    label: "Working tree",
    text: "",
  });
  assert.equal(resource.root, root);
  assert.equal(await resource.load("new.png"), `${root}/assets/new.png?v=7`);
  await assert.rejects(resource.load("https://evil.test/x.png"), /vault link/);
  await assert.rejects(resource.load("missing.md"), /not an image/);
  assert.deepEqual(resolutions, [source]);

  const directory = await mkdtemp(join(tmpdir(), "mw-diff-images-"));
  const rootUri = pathToFileURL(directory).href;
  const revisions: [string, string][] = [];
  try {
    await mkdir(`${directory}/notes`);
    await writeFile(`${directory}/old.png`, new Uint8Array([1]));
    await writeFile(`${directory}/new.png`, new Uint8Array([2]));
    const localVaults = {
      async forDocument(uri: string) {
        assert.equal(uri, `${rootUri}/notes/n.md`);
        return {
          async settled() {},
          index: {
            root: rootUri,
            resolveLink(target: string, relative: string) {
              assert.equal(relative, "notes/n.md");
              return { uri: `${rootUri}/${target}`, path: target };
            },
          },
        };
      },
    } as unknown as Vaults;
    const revisionFiles = withHost(files, {
      git: {
        toGitUri(uri, ref) {
          revisions.push([uri, ref]);
          return gitUri(new URL(uri).pathname, ref);
        },
      },
    });
    for (const [ref, target] of [
      ["HEAD", "old.png"],
      ["", "new.png"],
    ]) {
      const access = await sideResources(localVaults, revisionFiles, {
        uri: gitUri(`${directory}/notes/n.md`, ref!),
        label: ref!,
        text: "",
      });
      assert.equal(
        await access.load(target!),
        gitUri(`${directory}/${target}`, ref!),
      );
    }
    assert.deepEqual(revisions, [
      [`${rootUri}/old.png`, "HEAD"],
      [`${rootUri}/new.png`, ""],
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(diffSource(gitUri("/vault/n.md", "")), {
    source: "file:///vault/n.md",
    ref: "",
  });
});

test("revision images read bytes from that revision; local resources use scoped webview URLs", async () => {
  const read: string[] = [];
  const access = {
    async read(uri: string) {
      read.push(uri);
      return new Uint8Array([1, 2, 3]);
    },
    localUrl: (uri: string) => `webview:${uri}`,
  };
  const left = gitUri("/vault/old.png", "HEAD");
  const right = gitUri("/vault/new.png", "");
  assert.equal(await diffImageUrl(left, access), "data:image/png;base64,AQID");
  assert.equal(await diffImageUrl(right, access), "data:image/png;base64,AQID");
  assert.deepEqual(read, [left, right]);
  assert.equal(
    await diffImageUrl("file:///vault/new.png?v=7", access),
    "webview:file:///vault/new.png?v=7",
  );
  await assert.rejects(
    diffImageUrl(gitUri("/vault/x.html", "HEAD"), access),
    /Unsupported/,
  );
  assert.deepEqual(
    diffResourceRoots("file:///extension/dist", [
      "file:///vault",
      "file:///vault",
    ]),
    ["file:///extension/dist", "file:///vault"],
  );
});

function imageFixture() {
  const listeners = new Map<string, () => void>();
  const fallback = { hidden: false, textContent: "" };
  const image = {
    dataset: { resource: "assets/diagram.png" },
    alt: "diagram",
    hidden: false,
    loading: "lazy",
    src: "",
    isConnected: true,
    ownerDocument: { createElement: () => fallback },
    after(node: unknown) {
      assert.equal(node, fallback);
    },
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, listener);
    },
  };
  const container = {
    querySelectorAll: () => [image],
  } as unknown as HTMLElement;
  return { image, fallback, listeners, container };
}

test("each side assigns resolved image sources and shows source fallback until load or on failure", async () => {
  for (const side of ["left", "right"] as const) {
    const f = imageFixture();
    resolveDiffImages({
      container: f.container,
      side,
      async load(actual, target) {
        assert.equal(actual, side);
        assert.equal(target, "assets/diagram.png");
        return `webview:${side}`;
      },
    });
    assert.match(
      f.fallback.textContent,
      /!\[diagram\]\(assets\/diagram.png\).*unavailable/,
    );
    assert.equal(
      f.image.loading,
      "eager",
      "hidden lazy images never start loading",
    );
    await Promise.resolve();
    assert.equal(f.image.src, `webview:${side}`);
    f.listeners.get("load")!();
    assert.equal(f.image.hidden, false);
    assert.equal(f.fallback.hidden, true);
    f.listeners.get("error")!();
    assert.equal(f.image.hidden, true);
    assert.equal(f.fallback.hidden, false);
  }
  const f = imageFixture();
  resolveDiffImages({
    container: f.container,
    side: "left",
    async load() {
      throw new Error("unresolvable");
    },
  });
  await Promise.resolve();
  assert.equal(f.image.src, "");
  assert.equal(f.fallback.hidden, false);
});

test("image resolution service is injected and withdrawn with its plugin", async () => {
  const root = createRoot();
  root.provide("vaults", {} as never);
  provideHostServices(root, fakeHost());
  const fiber = root.plugin(diffResourcesHost);
  await root.settled();
  let provided = false;
  root.plugin({
    name: "consumer",
    inject: { optional: ["diffResources"] },
    apply(ctx) {
      provided = Boolean(ctx.diffResources);
    },
  });
  await root.settled();
  assert.equal(provided, true);
  await fiber.dispose();
  await root.settled();
  assert.equal(provided, false);
  await root.dispose();
});

test("diff message schemas reject malformed sides, image requests and image replies", () => {
  for (const [schema, message] of [
    [diffUpdate, { type: "update", left: { uri: 42 }, right: {} }],
    [diffImageRequest, { type: "image", id: 1, side: "other", target: "a" }],
    [diffImageReply, { type: "image", id: 1, url: 42 }],
  ] as const) {
    assert.throws(() => schema.parse(message));
  }
});
