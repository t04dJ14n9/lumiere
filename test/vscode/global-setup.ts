/**
 * Starts a real VS Code for the tests: an isolated profile, extensions folder
 * and home folder under /tmp, this extension installed from a freshly
 * packaged VSIX and a workspace holding a generated Markdown fixture. Playwright then connects to VS Code's window over
 * the Chrome DevTools Protocol.
 *
 * Set VSCODE_EXECUTABLE to test another build, for example an installed
 * VS Code or Cursor. Each host gets its own profile.
 */
import { spawn, execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { createVSIX } from "@vscode/vsce";
import { hostExecutable, paths, writeState } from "./state";
import { hostCli } from "./host-cli";

export default async function globalSetup(): Promise<void> {
  const host = await resolveVsCode();
  rmSync(paths.root, { recursive: true, force: true });
  mkdirSync(path.join(paths.userData, "User"), { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.extensions, { recursive: true });
  mkdirSync(paths.probe, { recursive: true });
  writeFileSync(
    path.join(paths.userData, "User", "settings.json"),
    JSON.stringify(
      {
        "window.newWindowDimensions": "maximized",
        "workbench.startupEditor": "none",
        // DOM-driven tests need VS Code-rendered menus, including on macOS.
        "window.menuStyle": "custom",
        // Another desktop app can take OS focus while CDP drives this isolated
        // window. Keep native pickers open until the test accepts or dismisses them.
        "workbench.quickOpen.closeOnFocusLost": false,
        "security.workspace.trust.enabled": false,
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
        "extensions.autoCheckUpdates": false,
        // Dialogs drawn by VS Code itself, which the tests can click (macOS draws native ones).
        "window.dialogStyle": "custom",
        "files.simpleDialog.enable": true,
        // Extra settings for this throwaway profile only, as JSON (for diagnostics).
        ...(JSON.parse(
          process.env.MARKDOWN_WORKBENCH_TEST_SETTINGS ?? "{}",
        ) as Record<string, unknown>),
      },
      null,
      2,
    ),
  );

  mkdirSync(paths.workspace, { recursive: true });
  writeFileSync(
    path.join(paths.workspace, "Note.md"),
    "# Native Markdown\n\nOriginal line",
  );
  const vsix = path.join(paths.root, "extension.vsix");
  const suppliedVsix = process.env.MARKDOWN_WORKBENCH_TEST_VSIX;
  if (suppliedVsix) {
    copyFileSync(path.resolve(suppliedVsix), vsix);
  } else {
    await createVSIX({
      cwd: paths.repository,
      packagePath: vsix,
      dependencies: false,
      rewriteRelativeLinks: false,
    });
  }
  for (const extension of [vsix]) {
    execFileSync(
      host.cli,
      [
        "--user-data-dir",
        paths.userData,
        "--extensions-dir",
        paths.extensions,
        "--install-extension",
        extension,
        "--force",
      ],
      {
        stdio: "ignore",
        env: cleanEnvironment(),
      },
    );
  }

  const port = await freePort();
  const vscode = spawn(
    host.executable,
    [
      "--new-window",
      // Opt-in only for credential-free, disposable macOS test profiles.
      ...(process.platform === "darwin" &&
      process.env.VSCODE_TEST_MOCK_KEYCHAIN === "1"
        ? ["--use-mock-keychain"]
        : []),
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-workspace-trust",
      "--disable-telemetry",
      ...host.options,
      `--user-data-dir=${paths.userData}`,
      `--extensions-dir=${paths.extensions}`,
      `--remote-debugging-port=${port}`,
      paths.workspace,
    ],
    {
      detached: true,
      stdio: [
        "ignore",
        openSync(path.join(paths.root, "startup.log"), "a"),
        openSync(path.join(paths.root, "startup.log"), "a"),
      ],
      env: cleanEnvironment(),
    },
  );
  vscode.unref();

  writeState({ pid: vscode.pid!, webSocket: "", host: host.name });
  writeState({
    pid: vscode.pid!,
    webSocket: await devToolsWebSocket(port),
    host: host.name,
  });
  console.log(
    `Testing ${host.name} (${host.executable}) with profile ${paths.root}`,
  );
}

/**
 * The environment for the test VS Code: its own home folder, because VS Code
 * reads and rewrites `~/.vscode/argv.json` whatever profile it is given, the
 * probe's exchange folder, and no variable that would make Electron act as Node.
 */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: paths.home,
    MARKDOWN_WORKBENCH_PROBE_DIR: paths.probe,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

interface Host {
  name: string;
  executable: string;
  cli: string;
  /** Launch options this host understands that keep it isolated and quiet. */
  options: string[];
}

async function resolveVsCode(): Promise<Host> {
  const installed = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
  let executable =
    hostExecutable ??
    (existsSync(installed)
      ? installed
      : await downloadAndUnzipVSCode({
          version: "stable",
          cachePath: paths.download,
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
  ) as {
    nameShort: string;
    version: string;
    applicationName?: string;
  };
  const cli = hostCli({
    app,
    resources,
    platform: process.platform,
    ...(product.applicationName === undefined
      ? {}
      : { applicationName: product.applicationName }),
    exists: existsSync,
  });
  // The command-line options are declared in the main process bundle, which
  // newer builds split into main.js and mainImpl.js.
  const main = ["main.js", "mainImpl.js"]
    .map((name) => path.join(resources, "out", name))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const supports = (option: string): boolean =>
    main.includes(`"${option}":{type:"boolean"`);
  const options = [
    // Keep secrets in memory rather than in the user's keychain.
    ...(supports("use-inmemory-secretstorage")
      ? ["--use-inmemory-secretstorage"]
      : []),
    // Cursor's first-run onboarding covers the window.
    ...(supports("skip-onboarding") ? ["--skip-onboarding"] : []),
    ...(supports("disable-updates") ? ["--disable-updates"] : []),
    // Never the desktop keyring on Linux (Cursor otherwise asks for it).
    ...(process.platform === "linux" ? ["--password-store=basic"] : []),
  ];
  return {
    name: `${product.nameShort} ${product.version}`,
    executable,
    cli,
    options,
  };
}

function freePort(): Promise<number> {
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

async function devToolsWebSocket(port: number): Promise<string> {
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
