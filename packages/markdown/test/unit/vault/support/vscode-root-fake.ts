import path from "node:path";

/** The slice of `vscode` that vault-system.ts uses to list a vault. */
export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  static parse(text: string): Uri {
    const colon = text.indexOf(":");
    return new Uri(text.slice(0, colon), text.slice(colon + 1));
  }
  /** Refuses a URI without a path, as VS Code's does. */
  static joinPath(base: Uri, ...parts: string[]): Uri {
    if (!base.path) {
      throw new Error(
        `[UriError]: cannot call joinPath on URI without path: ${base}`,
      );
    }
    return new Uri(base.scheme, path.posix.join(base.path, ...parts));
  }
  with(change: { path: string }): Uri {
    return new Uri(this.scheme, change.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

export const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };

/** The file system: a folder lists its entries; a file has a size. */
const entries = new Map<string, [string, number][]>([
  [
    "/",
    [
      ["Welcome.md", FileType.File],
      ["notes", FileType.Directory],
    ],
  ],
  ["/notes", [["Second.md", FileType.File]]],
]);

export const workspace = {
  fs: {
    readDirectory: async (uri: Uri) => entries.get(uri.path) ?? [],
    stat: async (uri: Uri) => ({
      type: entries.has(uri.path) ? FileType.Directory : FileType.File,
      mtime: 1,
      size: 10,
    }),
  },
};
