import path from "node:path";

/** The slice of `vscode` that native-link-containment.ts uses. */
export class Uri {
  constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
  ) {}
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(
      base.scheme,
      base.authority,
      path.posix.join(base.path, ...parts),
    );
  }
  get fsPath(): string {
    return this.path;
  }
  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

export const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };

export class FileSystemError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** The file system: path → type. Paths not listed do not exist. */
export const files = new Map<string, number>();

export const workspace = {
  fs: {
    async stat(uri: Uri) {
      const type = files.get(uri.path);
      if (type === undefined) {
        throw new FileSystemError("FileNotFound");
      }
      return { type };
    },
  },
};
