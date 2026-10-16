import {
  leasePathFor,
  readLease,
  renewLeaseAtomic,
  writeLeaseAtomic,
  type LeaseSidecar,
  type TempFs,
} from "./temp-lease";
import { reclaimEligible, type ReclaimCaps } from "./temp-reclaim";

const DEFAULT_RECLAIM_CAPS: ReclaimCaps = {
  maxFiles: 8,
  maxBytes: 2 * 1024 * 1024,
};

export interface PublishOpts {
  dir: string;
  basename: string;
  bytes: Buffer;
  owner: LeaseSidecar["owner"];
  sessionId: string;
  now: () => number;
  leaseMs: number;
  /** Test hook: after final lease sidecar is published (before final payload rename). */
  onAfterLeasePublished?: () => void | Promise<void>;
  /**
   * Test hook: after successful final revalidation — treated as a suspension.
   * On return, precondition MUST be re-run from scratch (stale decision forbidden).
   * Return `false` to disarm the hook for subsequent attempts (reacquire→publish path).
   */
  onAfterFinalRevalidated?: () => void | boolean | Promise<void | boolean>;
  reclaimCaps?: ReclaimCaps;
}

export type PublishResult =
  { finalPath: string } | { skipped: true; warning: string };

function join(dir: string, name: string): string {
  return `${dir.replace(/\/$/, "")}/${name}`;
}

async function ensureQuota(
  fs: TempFs,
  dir: string,
  now: () => number,
  caps: ReclaimCaps,
  extraBytes: number,
): Promise<{ ok: true } | { skipped: true; warning: string }> {
  await reclaimEligible(fs, dir, now, caps);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const payloads = names.filter(
    (n) =>
      n.startsWith("ide-context-") &&
      n.endsWith(".json") &&
      !n.includes(".partial") &&
      !n.endsWith(".lease"),
  );
  let totalBytes = 0;
  for (const n of payloads) {
    try {
      const st = await fs.stat(join(dir, n));
      totalBytes += st.size;
    } catch {
      // ignore
    }
  }
  if (
    payloads.length >= caps.maxFiles ||
    totalBytes + extraBytes > caps.maxBytes
  ) {
    // Try reclaim again; if still full of protected siblings → soft-fail
    await reclaimEligible(fs, dir, now, caps);
    const names2 = await fs.readdir(dir).catch(() => [] as string[]);
    const payloads2 = names2.filter(
      (n) =>
        n.startsWith("ide-context-") &&
        n.endsWith(".json") &&
        !n.includes(".partial") &&
        !n.endsWith(".lease"),
    );
    let total2 = 0;
    for (const n of payloads2) {
      try {
        total2 += (await fs.stat(join(dir, n))).size;
      } catch {
        /* */
      }
    }
    if (
      payloads2.length >= caps.maxFiles ||
      total2 + extraBytes > caps.maxBytes
    ) {
      return {
        skipped: true,
        warning:
          "ide-context temp: quota full; all candidates lease-protected; skipped file attach",
      };
    }
  }
  return { ok: true };
}

/**
 * Final-commit: revalidate/renew then rename in the same non-yielding section.
 * NORMATIVE: no await/yield/sleep between revalidate success and rename (design r7).
 * If `onAfterFinalRevalidated` runs, treat as yield → re-run precondition after it resolves.
 */
export async function commitFinalPayload(
  fs: TempFs,
  args: {
    partialPath: string;
    finalPath: string;
    leasePath: string;
    owner: LeaseSidecar["owner"];
    sessionId: string;
    now: () => number;
    leaseMs: number;
    onAfterFinalRevalidated?: () => void | boolean | Promise<void | boolean>;
  },
): Promise<"ok" | "abort"> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const decision = await revalidateOrRenew(fs, args);
    if (!decision.ok) return "abort";

    if (args.onAfterFinalRevalidated) {
      // Suspension after successful revalidation — decision becomes stale
      const keep = await args.onAfterFinalRevalidated();
      if (keep === false) {
        args.onAfterFinalRevalidated = undefined;
      }
      // MUST re-run precondition from scratch (stale decision forbidden)
      continue;
    }

    // NORMATIVE: no await/yield/sleep between revalidate success and rename (design r7).
    if (fs.renameSync) {
      fs.renameSync(args.partialPath, args.finalPath);
    } else {
      // Single await of rename itself is allowed; nothing else between success and rename.
      await fs.rename(args.partialPath, args.finalPath);
    }
    return "ok";
  }
  return "abort";
}

async function revalidateOrRenew(
  fs: TempFs,
  args: {
    leasePath: string;
    owner: LeaseSidecar["owner"];
    sessionId: string;
    now: () => number;
    leaseMs: number;
  },
): Promise<{ ok: true } | { ok: false }> {
  const marginMs = Math.min(5_000, Math.floor(args.leaseMs / 2));
  const needUntil = args.now() + marginMs;
  const lease = await readLease(fs, args.leasePath);
  if (lease && Date.parse(lease.leaseUntil) > needUntil) {
    return { ok: true };
  }
  // absent / expired / too-near → renew
  const next: LeaseSidecar = {
    leaseUntil: new Date(args.now() + args.leaseMs).toISOString(),
    owner: args.owner,
    sessionId: args.sessionId,
  };
  try {
    if (lease) {
      await renewLeaseAtomic(fs, args.leasePath, next);
    } else {
      await writeLeaseAtomic(fs, args.leasePath, next);
    }
    // re-read to confirm
    const again = await readLease(fs, args.leasePath);
    if (again && Date.parse(again.leaseUntil) > args.now()) return { ok: true };
  } catch {
    return { ok: false };
  }
  return { ok: false };
}

export async function publishIdeContextTemp(
  fs: TempFs,
  opts: PublishOpts,
): Promise<PublishResult> {
  const caps = opts.reclaimCaps ?? DEFAULT_RECLAIM_CAPS;
  await fs.mkdir(opts.dir, { recursive: true, mode: 0o700 });

  const quota = await ensureQuota(
    fs,
    opts.dir,
    opts.now,
    caps,
    opts.bytes.length,
  );
  if ("skipped" in quota) return quota;

  const finalPath = join(opts.dir, opts.basename);
  const partialPath = `${finalPath}.partial`;
  const leasePath = leasePathFor(finalPath);

  // 1) staging payload
  await fs.writeFile(partialPath, opts.bytes, { mode: 0o600 });

  // 2) lease staging → final .lease
  const lease: LeaseSidecar = {
    leaseUntil: new Date(opts.now() + opts.leaseMs).toISOString(),
    owner: opts.owner,
    sessionId: opts.sessionId,
  };
  await writeLeaseAtomic(fs, leasePath, lease);

  if (opts.onAfterLeasePublished) {
    await opts.onAfterLeasePublished();
  }

  // 3) final-commit revalidate + non-yielding rename
  const committed = await commitFinalPayload(fs, {
    partialPath,
    finalPath,
    leasePath,
    owner: opts.owner,
    sessionId: opts.sessionId,
    now: opts.now,
    leaseMs: opts.leaseMs,
    onAfterFinalRevalidated: opts.onAfterFinalRevalidated,
  });

  if (committed !== "ok") {
    // Soft-fail: leave orphan lease; no final payload
    return {
      skipped: true,
      warning:
        "ide-context temp: final commit aborted after lease revalidation; skipped file attach",
    };
  }

  return { finalPath };
}
