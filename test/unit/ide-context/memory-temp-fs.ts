import { join } from "node:path";

type Entry =
  | { kind: "file"; data: Buffer; mtimeMs: number; mode?: number }
  | { kind: "dir"; mtimeMs: number; mode?: number };

/** In-memory FS façade for lease/publish/reclaim unit tests. */
export class MemoryTempFs {
  private store = new Map<string, Entry>();
  onAfterWrite?: (name: string) => void;
  nowMs = 0;

  private key(p: string): string {
    return p.replace(/\\/g, "/");
  }

  private basename(p: string): string {
    const k = this.key(p);
    const i = k.lastIndexOf("/");
    return i >= 0 ? k.slice(i + 1) : k;
  }

  private findKey(nameOrPath: string): string | undefined {
    const k = this.key(nameOrPath);
    if (this.store.has(k)) {
      return k;
    }
    for (const key of this.store.keys()) {
      if (this.basename(key) === nameOrPath) {
        return key;
      }
    }
    return undefined;
  }

  exists(nameOrPath: string): boolean {
    return this.findKey(nameOrPath) !== undefined;
  }

  read(nameOrPath: string): string {
    return this.readFileSync(nameOrPath).toString("utf8");
  }

  async mkdir(
    path: string,
    _opts?: { recursive?: boolean; mode?: number },
  ): Promise<void> {
    const k = this.key(path);
    if (!this.store.has(k)) {
      this.store.set(k, { kind: "dir", mtimeMs: this.nowMs, mode: 0o700 });
    }
  }

  async writeFile(
    path: string,
    data: string | Buffer,
    opts?: { mode?: number },
  ): Promise<void> {
    this.writeFileSync(path, data, opts);
  }

  writeFileSync(
    path: string,
    data: string | Buffer,
    opts?: { mode?: number },
  ): void {
    const k = this.key(path);
    const buf =
      typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    this.store.set(k, {
      kind: "file",
      data: buf,
      mtimeMs: this.nowMs,
      ...(opts?.mode !== undefined ? { mode: opts.mode } : {}),
    });
    this.onAfterWrite?.(this.basename(k));
  }

  async rename(from: string, to: string): Promise<void> {
    this.renameSync(from, to);
  }

  renameSync(from: string, to: string): void {
    const fk = this.key(from);
    const tk = this.key(to);
    const entry = this.store.get(fk);
    if (!entry) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    this.store.delete(fk);
    this.store.set(tk, { ...entry, mtimeMs: this.nowMs });
    this.onAfterWrite?.(this.basename(tk));
  }

  async readFile(path: string): Promise<Buffer> {
    return this.readFileSync(path);
  }

  readFileSync(path: string): Buffer {
    const found = this.findKey(path);
    if (!found) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    const entry = this.store.get(found)!;
    if (entry.kind !== "file") {
      throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });
    }
    return Buffer.from(entry.data);
  }

  async unlink(path: string): Promise<void> {
    const found = this.findKey(path);
    if (!found) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    this.store.delete(found);
  }

  async listNames(dir: string): Promise<string[]> {
    const prefix = this.key(dir).replace(/\/$/, "") + "/";
    const names = new Set<string>();
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes("/")) {
          names.add(rest);
        }
      }
    }
    return [...names];
  }

  async stat(path: string): Promise<{
    mtimeMs: number;
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }> {
    const found = this.findKey(path);
    if (!found) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    const entry = this.store.get(found)!;
    const size = entry.kind === "file" ? entry.data.length : 0;
    return {
      mtimeMs: entry.mtimeMs,
      size,
      isFile: () => entry.kind === "file",
      isDirectory: () => entry.kind === "dir",
    };
  }

  resolve(dir: string, name: string): string {
    return join(dir, name).replace(/\\/g, "/");
  }

  setMtime(path: string, mtimeMs: number): void {
    const found = this.findKey(path);
    if (!found) {
      return;
    }
    const entry = this.store.get(found)!;
    this.store.set(found, { ...entry, mtimeMs });
  }

  listAll(): string[] {
    return [...this.store.keys()];
  }
}
