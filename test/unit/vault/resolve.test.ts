import test from "node:test";
import assert from "node:assert/strict";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { LinkFormat } from "../../../src/plugins/vault/link-text";

function vault(
  paths: string[],
  folderNote = "",
  linkFormat: LinkFormat = "shortest",
) {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote,
    linkFormat,
  });
  index.replaceFiles(
    paths.map((path) => ({
      uri: `file:///vault/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  return index;
}

const files = [
  "Home.md",
  "Unique.md",
  "notes/Shared.md",
  "notes/deep/Shared.md",
  "archive/Shared.md",
  "notes/Local.md",
  "notes/sub/Child.md",
  "projects/Plan.md",
  "projects/Plan.pdf",
  "assets/image.png",
  "Folder/_index.md",
  "Folder/Other.md",
  "Mixed Case.md",
];

const cases: [string, string, string, string | undefined][] = [
  // [description, linktext, source, expected destination]
  [
    "empty path means the source note",
    "#Heading",
    "notes/Local.md",
    "notes/Local.md",
  ],
  [
    "exact path without extension",
    "projects/Plan",
    "Home.md",
    "projects/Plan.md",
  ],
  [
    "exact path with extension",
    "projects/Plan.pdf",
    "Home.md",
    "projects/Plan.pdf",
  ],
  [
    "exact path ignores subpath and case",
    "PROJECTS/plan#Goals",
    "Home.md",
    "projects/Plan.md",
  ],
  ["unique basename anywhere", "Unique", "notes/sub/Child.md", "Unique.md"],
  [
    "unique basename for attachments keeps extension",
    "image.png",
    "Home.md",
    "assets/image.png",
  ],
  ["unique basename ignores case", "mixed case", "Home.md", "Mixed Case.md"],
  [
    "./ resolves from the source folder",
    "./Local",
    "notes/Shared.md",
    "notes/Local.md",
  ],
  [
    "../ climbs from the source folder",
    "../Local",
    "notes/sub/Child.md",
    "notes/Local.md",
  ],
  [
    "../ beyond the vault root does not resolve",
    "../../Home",
    "notes/Local.md",
    undefined,
  ],
  [
    "leading slash starts at the vault root",
    "/projects/Plan",
    "notes/Local.md",
    "projects/Plan.md",
  ],
  [
    "ambiguous name prefers the same folder",
    "Shared",
    "notes/Local.md",
    "notes/Shared.md",
  ],
  [
    "ambiguous name prefers the nearest folder",
    "Shared",
    "notes/deep/Note.md",
    "notes/deep/Shared.md",
  ],
  [
    "ambiguous name with equal distance sorts by path",
    "Shared",
    "Home.md",
    "archive/Shared.md",
  ],
  [
    "path suffix narrows ambiguous names",
    "deep/Shared",
    "Home.md",
    "notes/deep/Shared.md",
  ],
  ["unknown note does not resolve", "Missing", "Home.md", undefined],
  [
    "folder link without a folder note does not resolve",
    "Folder",
    "Home.md",
    undefined,
  ],
  ["alias text is not part of the path", "Unique", "Home.md", "Unique.md"],
];

for (const [description, linktext, source, expected] of cases) {
  test(`resolveLink: ${description}`, () => {
    assert.equal(vault(files).resolveLink(linktext, source)?.path, expected);
  });
}

test("resolveLink: a folder link opens the configured folder note", () => {
  const index = vault(files, "_index.md");
  assert.equal(
    index.resolveLink("Folder", "Home.md")?.path,
    "Folder/_index.md",
  );
  assert.equal(index.resolveLink("Other", "Home.md")?.path, "Folder/Other.md");
});

test("resolveLinkCandidates lists every ambiguous match nearest first", () => {
  assert.deepEqual(
    vault(files)
      .resolveLinkCandidates("Shared", "notes/sub/Child.md")
      .map((file) => file.path),
    ["notes/Shared.md", "notes/deep/Shared.md", "archive/Shared.md"],
  );
});

test("linkText follows the new link format", () => {
  const formats: [LinkFormat, string, string, string][] = [
    ["shortest", "Unique.md", "notes/Local.md", "Unique"],
    ["shortest", "notes/Shared.md", "Home.md", "notes/Shared"],
    ["shortest", "assets/image.png", "Home.md", "image.png"],
    ["relative", "notes/sub/Child.md", "notes/Local.md", "sub/Child"],
    ["relative", "Home.md", "notes/sub/Child.md", "../../Home"],
    ["absolute", "Unique.md", "notes/Local.md", "Unique"],
    ["absolute", "notes/sub/Child.md", "Home.md", "notes/sub/Child"],
  ];
  for (const [format, target, source, expected] of formats) {
    const index = vault(files, "", format);
    assert.equal(
      index.linkText(index.file(target)!, source),
      expected,
      `${format} ${target}`,
    );
  }
});
