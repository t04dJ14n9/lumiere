import path from "node:path";

/** The slice of `vscode` that vault-system.ts touches while it starts its parser. */
export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  static file(fsPath: string): Uri {
    return new Uri("file", fsPath);
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(base.scheme, path.posix.join(base.path, ...parts));
  }
  get fsPath(): string {
    return this.path;
  }
}
