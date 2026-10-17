/**
 * Finding and starting the VS Code build under test, shared by the Markdown
 * (test/vscode) and PDF (packages/pdf/test/vscode) harnesses.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { hostCli } from "./host-cli";

export interface VsCodeHost {
  /** Product name and version, for the test report. */
  name: string;
  executable: string;
  cli: string;
  /** Launch options this host understands that keep it isolated and quiet. */
  options: string[];
}

/**
 * The build to test: `executable` (VSCODE_EXECUTABLE: an installed VS Code
 * or a fork such as Cursor), else the installed VS Code, else the stable
 * build downloaded into `downloadPath`.
 */
export async function resolveVsCode(options: {
  executable: string | undefined;
  downloadPath: string;
}): Promise<VsCodeHost> {
  const installed = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
  let executable =
    options.executable ??
    (existsSync(installed)
      ? installed
      : await downloadAndUnzipVSCode({
          version: "stable",
          cachePath: options.downloadPath,
        }));
  // Newer macOS builds name the binary "Code"; the downloader still reports "Electron".
  if (!existsSync(executable)) {
    executable = path.join(path.dirname(executable), "Code");
  }
  const app =
    process.platform === "darwin"
      ? path.resolve(executable, "..", "..")
      : path.dirname(executable);
  const resources =
    process.platform === "darwin"
      ? path.join(app, "Resources", "app")
      : path.join(app, "resources", "app");
  const product = JSON.parse(
    readFileSync(path.join(resources, "product.json"), "utf8"),
  ) as { nameShort: string; version: string; applicationName?: string };
  const cli = hostCli({
    app,
    resources,
    platform: process.platform,
    ...(product.applicationName === undefined
      ? {}
      : { applicationName: product.applicationName }),
    exists: existsSync,
  });
  return {
    name: `${product.nameShort} ${product.version}`,
    executable,
    cli,
    options: launchOptions(resources),
  };
}

/**
 * Options that keep the test window isolated and quiet, each passed only when
 * the build declares it. The command-line options are declared in the main
 * process bundle, which newer builds split into main.js and mainImpl.js.
 */
function launchOptions(resources: string): string[] {
  const main = ["main.js", "mainImpl.js"]
    .map((name) => path.join(resources, "out", name))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const supports = (option: string): boolean =>
    main.includes(`"${option}":{type:"boolean"`);
  return [
    // Keep secrets in memory rather than in the user's keychain.
    ...(supports("use-inmemory-secretstorage")
      ? ["--use-inmemory-secretstorage"]
      : []),
    // Cursor's first-run onboarding covers the window.
    ...(supports("skip-onboarding") ? ["--skip-onboarding"] : []),
    ...(supports("disable-updates") ? ["--disable-updates"] : []),
    // Never the desktop keyring on Linux (Cursor otherwise asks for it). Not
    // on macOS: there VS Code 1.142 stops before opening its window.
    ...(process.platform === "linux" ? ["--password-store=basic"] : []),
  ];
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No port")),
      );
    });
  });
}

/** The window's DevTools WebSocket, once VS Code has opened its debugging port. */
export async function devToolsWebSocket(port: number): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return ((await response.json()) as { webSocketDebuggerUrl: string })
          .webSocketDebuggerUrl;
      }
    } catch {
      // VS Code is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("VS Code did not open its debugging port within 60 seconds");
}
