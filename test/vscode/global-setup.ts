/**
 * Starts a real VS Code for the tests: an isolated profile, extensions folder
 * and home folder under /tmp, this extension installed from a freshly
 * packaged VSIX and a workspace holding a generated Markdown fixture. Playwright then connects to VS Code's window over
 * the Chrome DevTools Protocol. MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1 instead
 * loads the built checkout through --extensionDevelopmentPath without packaging
 * or installing a VSIX; the disposable profile stays isolated in both modes.
 *
 * Set VSCODE_EXECUTABLE to test another build, for example an installed
 * VS Code or Cursor. Each host gets its own profile.
 */
import { spawn, execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createVSIX } from "@vscode/vsce";
import { hostExecutable, paths, writeState } from "./state";
import { devToolsWebSocket, freePort, resolveVsCode } from "./vscode-host";

export default async function globalSetup(): Promise<void> {
  const host = await resolveVsCode({
    executable: hostExecutable,
    downloadPath: paths.download,
  });
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
  const isUnpackaged = process.env.MARKDOWN_WORKBENCH_TEST_UNPACKAGED === "1";
  if (!isUnpackaged) {
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
  }

  const port = await freePort();
  const vscode = spawn(
    host.executable,
    [
      "--new-window",
      ...(isUnpackaged
        ? [`--extensionDevelopmentPath=${paths.repository}`]
        : []),
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
