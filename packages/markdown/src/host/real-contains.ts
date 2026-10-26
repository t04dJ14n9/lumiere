import { realpath } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `HostWorkspace.realContains` on the local disk: `uri` is inside `root`
 * once both are resolved through symbolic links. A missing path rejects.
 */
export async function realContains(
  root: string,
  uri: string,
): Promise<boolean> {
  const [base, target] = await Promise.all([
    realpath(fileURLToPath(root)),
    realpath(fileURLToPath(uri)),
  ]);
  const relative = path.relative(base, target);
  return !(
    relative.startsWith(".." + path.sep) ||
    relative === ".." ||
    path.isAbsolute(relative)
  );
}
