import path from "node:path";

/**
 * The command-line launcher of a VS Code build. VS Code ships `bin/code`;
 * Cursor ships `bin/cursor` (its product's application name), so the
 * application name is tried first and `code` is the fallback.
 */
export function hostCli(options: {
  app: string;
  resources: string;
  platform: NodeJS.Platform;
  applicationName?: string;
  exists(file: string): boolean;
}): string {
  const { app, resources, platform, exists } = options;
  const names = [...new Set([options.applicationName ?? "code", "code"])];
  const candidates = names.map((name) => {
    if (platform === "darwin") {
      return path.join(resources, "bin", name);
    }
    return path.join(app, "bin", platform === "win32" ? `${name}.cmd` : name);
  });
  return candidates.find(exists) ?? candidates.at(-1)!;
}
