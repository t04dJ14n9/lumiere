export interface LeaseSidecar {
  leaseUntil: string; // ISO-8601
  owner: "markdownWorkshop" | "pdfWorkshop";
  sessionId: string;
}

export interface TempFs {
  mkdir(
    path: string,
    opts?: { recursive?: boolean; mode?: number },
  ): Promise<void>;
  writeFile(
    path: string,
    data: string | Buffer,
    opts?: { mode?: number },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  unlink(path: string): Promise<void>;
  readdir(dir: string): Promise<string[]>;
  stat(path: string): Promise<{
    mtimeMs: number;
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }>;
  /** Optional sync rename for non-yielding final commit */
  renameSync?(from: string, to: string): void;
  writeFileSync?(
    path: string,
    data: string | Buffer,
    opts?: { mode?: number },
  ): void;
  readFileSync?(path: string): Buffer;
}

export function leasePathFor(finalPayloadPath: string): string {
  return `${finalPayloadPath}.lease`;
}

export function parseLease(raw: string | Buffer): LeaseSidecar | undefined {
  try {
    const obj = JSON.parse(
      typeof raw === "string" ? raw : raw.toString("utf8"),
    ) as LeaseSidecar;
    if (
      typeof obj?.leaseUntil === "string" &&
      (obj.owner === "markdownWorkshop" || obj.owner === "pdfWorkshop") &&
      typeof obj.sessionId === "string"
    ) {
      return obj;
    }
  } catch {
    // unreadable
  }
  return undefined;
}

export async function readLease(
  fs: TempFs,
  finalLeasePath: string,
): Promise<LeaseSidecar | undefined> {
  try {
    const buf = await fs.readFile(finalLeasePath);
    return parseLease(buf);
  } catch {
    return undefined;
  }
}

/** Atomic renewal: staging sidecar → rename over final `.lease`. */
export async function renewLeaseAtomic(
  fs: TempFs,
  finalLeasePath: string,
  next: LeaseSidecar,
): Promise<void> {
  const staging = `${finalLeasePath}.renew-${next.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body = JSON.stringify(next);
  await fs.writeFile(staging, body, { mode: 0o600 });
  await fs.rename(staging, finalLeasePath);
}

export async function writeLeaseAtomic(
  fs: TempFs,
  finalLeasePath: string,
  lease: LeaseSidecar,
): Promise<void> {
  const staging = `${finalLeasePath}.staging-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(staging, JSON.stringify(lease), { mode: 0o600 });
  await fs.rename(staging, finalLeasePath);
}
