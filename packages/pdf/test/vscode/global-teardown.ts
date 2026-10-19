import { existsSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";

/** Stop the test VS Code: its whole process group, and nothing else. */
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(path.join(paths.root, "state.json"))) {
    return;
  }
  const { pid } = readState();
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-pid, signal);
    } catch {
      return; // Already gone.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
}
