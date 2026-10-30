import { createHash, randomBytes } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import path from "node:path";

/** Same-directory temp → fsync → rename over `targetPath`. */
export async function writeAtomicFile(
  targetPath: string,
  bytes: Uint8Array,
): Promise<{ sha256: string }> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const temp = path.join(
    dir,
    `.${base}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    const handle = await open(temp, "w");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, targetPath);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  return { sha256 };
}
