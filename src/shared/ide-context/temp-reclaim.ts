import { leasePathFor, parseLease, readLease, type TempFs } from "./temp-lease";

export interface ReclaimCaps {
  maxFiles: number;
  maxBytes: number;
}

const YOUNG_FILE_MS = 60_000;

function join(dir: string, name: string): string {
  return `${dir.replace(/\/$/, "")}/${name}`;
}

export async function isReclaimablePayload(
  fs: TempFs,
  dir: string,
  basename: string,
  now: () => number,
): Promise<boolean> {
  const finalPath = join(dir, basename);
  const leasePath = leasePathFor(finalPath);
  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(finalPath)).mtimeMs;
  } catch {
    return false;
  }
  const age = now() - mtimeMs;
  const lease = await readLease(fs, leasePath);
  if (lease) {
    return Date.parse(lease.leaseUntil) <= now();
  }
  // missing sidecar: only if age >= 60s
  return age >= YOUNG_FILE_MS;
}

export async function reclaimEligible(
  fs: TempFs,
  dir: string,
  now: () => number,
  _caps: ReclaimCaps,
): Promise<void> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }

  // Orphan sidecars (no final payload)
  for (const name of names) {
    if (!name.endsWith(".lease")) continue;
    if (name.includes(".staging-") || name.includes(".renew-")) {
      // stale lease-staging — reclaim if old
      try {
        const st = await fs.stat(join(dir, name));
        if (now() - st.mtimeMs >= YOUNG_FILE_MS) await fs.unlink(join(dir, name));
      } catch {
        /* */
      }
      continue;
    }
    const payloadName = name.slice(0, -".lease".length);
    const payloadExists = names.includes(payloadName);
    if (!payloadExists) {
      // orphan sidecar: keep if valid future leaseUntil
      try {
        const raw = await fs.readFile(join(dir, name));
        const lease = parseLease(raw);
        if (!lease || Date.parse(lease.leaseUntil) <= now()) {
          await fs.unlink(join(dir, name));
        }
      } catch {
        try {
          await fs.unlink(join(dir, name));
        } catch {
          /* */
        }
      }
    }
  }

  // Stale staging payloads
  for (const name of names) {
    if (name.endsWith(".partial") || name.endsWith(".tmp")) {
      try {
        const st = await fs.stat(join(dir, name));
        if (now() - st.mtimeMs >= YOUNG_FILE_MS) await fs.unlink(join(dir, name));
      } catch {
        /* */
      }
    }
  }

  // Reclaimable payloads (LRU by mtime among eligible)
  const payloads = names.filter(
    (n) =>
      n.startsWith("ide-context-") &&
      n.endsWith(".json") &&
      !n.includes(".partial") &&
      !n.endsWith(".lease"),
  );
  const eligible: { name: string; mtimeMs: number }[] = [];
  for (const n of payloads) {
    if (await isReclaimablePayload(fs, dir, n, now)) {
      try {
        eligible.push({ name: n, mtimeMs: (await fs.stat(join(dir, n))).mtimeMs });
      } catch {
        /* */
      }
    }
  }
  eligible.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const e of eligible) {
    try {
      await fs.unlink(join(dir, e.name));
    } catch {
      /* */
    }
    try {
      await fs.unlink(leasePathFor(join(dir, e.name)));
    } catch {
      /* */
    }
  }
}
