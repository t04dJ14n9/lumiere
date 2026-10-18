import type { OperatingSystem } from "../services";

/**
 * The user's operating system from the browser's user agent, by Node's
 * `process.platform` names. Only the Mac matters so far (its shortcut
 * symbols, Look Up), and every browser on a Mac says "Mac".
 */
export function browserOperatingSystem(userAgent: string): OperatingSystem {
  if (/Mac|iPhone|iPad/.test(userAgent)) {
    return { platform: "darwin" };
  }
  if (/Windows/.test(userAgent)) {
    return { platform: "win32" };
  }
  return { platform: "linux" };
}
