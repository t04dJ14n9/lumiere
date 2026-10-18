import { realpath } from "node:fs/promises";
import path from "node:path";
import type { RealPaths } from "../services";

export const nodeRealPaths: RealPaths = {
  async isInside(root, target, missing = "reject") {
    const [base, actual] = await Promise.all([
      realpath(root),
      missing === "reject" ? realpath(target) : nearestRealPath(target),
    ]);
    const relative = path.relative(base, actual);
    return !(
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    );
  },
};

/** The real path of `file`, or of its nearest existing ancestor while it does not exist. */
async function nearestRealPath(file: string): Promise<string> {
  let candidate = file;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      candidate = parent;
    }
  }
}
