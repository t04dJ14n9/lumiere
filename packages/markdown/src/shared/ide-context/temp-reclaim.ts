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
  let mtimeMs: number;
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

async function reclaimLeaseStaging(
  fs: TempFs,
  dir: string,
  names: string[],
  now: () => number,
): Promise<void> {
  // Lease staging/renew leftovers (names like *.lease.staging-* / *.lease.renew-*
  // do NOT endsWith(".lease"), so this pass must run independently of that gate).
  for (const name of names) {
    if (!name.includes(".lease.staging-") && !name.includes(".lease.renew-")) {
      continue;
    }
    try {
      const st = await fs.stat(join(dir, name));
      if (now() - st.mtimeMs >= YOUNG_FILE_MS) {
        await fs.unlink(join(dir, name));
      }
    } catch {
      /* */
    }
  }
}

async function reclaimOrphanSidecars(
  fs: TempFs,
  dir: string,
  names: string[],
  now: () => number,
): Promise<void> {
  for (const name of names) {
    if (!name.endsWith(".lease")) {
      continue;
    }
    const payloadName = name.slice(0, -".lease".length);
    if (names.includes(payloadName)) {
      continue;
    }
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

async function reclaimStalePartials(
  fs: TempFs,
  dir: string,
  names: string[],
  now: () => number,
): Promise<void> {
  for (const name of names) {
    if (!name.endsWith(".partial") && !name.endsWith(".tmp")) {
      continue;
    }
    try {
      const st = await fs.stat(join(dir, name));
      if (now() - st.mtimeMs >= YOUNG_FILE_MS) {
        await fs.unlink(join(dir, name));
      }
    } catch {
      /* */
    }
  }
}

async function reclaimPayloads(
  fs: TempFs,
  dir: string,
  names: string[],
  now: () => number,
): Promise<void> {
  const payloads = names.filter(
    (n) =>
      n.startsWith("ide-context-") &&
      n.endsWith(".json") &&
      !n.includes(".partial") &&
      !n.endsWith(".lease"),
  );
  const eligible: { name: string; mtimeMs: number }[] = [];
  for (const n of payloads) {
    if (!(await isReclaimablePayload(fs, dir, n, now))) {
      continue;
    }
    try {
      eligible.push({
        name: n,
        mtimeMs: (await fs.stat(join(dir, n))).mtimeMs,
      });
    } catch {
      /* */
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

export async function reclaimEligible(
  fs: TempFs,
  dir: string,
  now: () => number,
  _caps: ReclaimCaps,
): Promise<void> {
  let names: string[];
  try {
    names = await fs.listNames(dir);
  } catch {
    return;
  }

  await reclaimLeaseStaging(fs, dir, names, now);
  await reclaimOrphanSidecars(fs, dir, names, now);
  await reclaimStalePartials(fs, dir, names, now);
  await reclaimPayloads(fs, dir, names, now);
}
