/**
 * Starts a real VS Code for the tests: an isolated profile and extensions
 * folder under /tmp, this extension installed from a freshly packaged VSIX
 * (or loaded from source with VSCODE_TEST_USE_SOURCE=1), and a workspace
 * holding the fixture PDFs. Playwright then connects to
 * VS Code's window over the Chrome DevTools Protocol.
 *
 * Set VSCODE_EXECUTABLE to test another build: an installed VS Code, or a
 * VS Code fork such as Cursor (its `cursor` executable; the CLI is then
 * `bin/cursor`).
 */
import { spawn, execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createVSIX } from "@vscode/vsce";
import type { FullConfig } from "@playwright/test";
import { paths, writeState } from "./state";
import {
  devToolsWebSocket,
  freePort,
  resolveVsCode,
} from "../../../../test/vscode/vscode-host";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const restrictedMode = config.metadata.restrictedMode === true;
  const useSource = process.env.VSCODE_TEST_USE_SOURCE === "1";
  const host = await resolveVsCode({
    executable: process.env.VSCODE_EXECUTABLE,
    downloadPath: paths.download,
  });
  const { executable, cli } = host;
  rmSync(paths.root, { recursive: true, force: true });
  mkdirSync(path.join(paths.userData, "User"), { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.extensions, { recursive: true });
  writeFileSync(
    path.join(paths.userData, "User", "settings.json"),
    JSON.stringify(
      {
        "window.newWindowDimensions": "maximized",
        "workbench.startupEditor": "none",
        // DOM-driven tests need VS Code-rendered menus, including on macOS.
        "window.menuStyle": "custom",
        "security.workspace.trust.enabled": restrictedMode,
        ...(restrictedMode
          ? {
              "security.workspace.trust.startupPrompt": "never",
              "security.workspace.trust.emptyWindow": false,
              "pdfWorkshop.agentBridge.enabled": false,
              "pdfWorkshop.copyLinkForAgent.target": "clipboard",
            }
          : {}),
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
        // Specs start every PDF from the defaults; view-controls.spec.ts turns this on.
        "pdfWorkshop.view.restoreOnReopen": false,
      },
      null,
      2,
    ),
  );

  mkdirSync(path.join(paths.workspace, "docs"), { recursive: true });
  copyFileSync(
    path.join(paths.fixtures, "outline.pdf"),
    path.join(paths.workspace, "docs", "outline.pdf"),
  );
  writeFileSync(path.join(paths.workspace, "notes.md"), "# Notes\n");
  if (restrictedMode) {
    mkdirSync(path.join(paths.workspace, ".vscode"));
    writeFileSync(
      path.join(paths.workspace, ".vscode", "settings.json"),
      JSON.stringify(
        {
          "pdfWorkshop.agentBridge.enabled": true,
          "pdfWorkshop.copyLinkForAgent.target": "claudeCode",
        },
        null,
        2,
      ),
    );
  }

  // A chat participant, as Copilot Chat declares, so VS Code's chat counts as
  // served and Copy Link for Agent opens it.
  const developmentPaths = [
    paths.extension,
    path.join(paths.repository, "test", "fixtures", "chat-participant"),
  ];
  if (restrictedMode) {
    developmentPaths.push(
      path.join(paths.repository, "test", "fixtures", "restricted-probe"),
    );
  }
  if (!useSource) {
    for (const [index, cwd] of developmentPaths.entries()) {
      const extension = path.join(paths.root, `extension-${index}.vsix`);
      await createVSIX({
        cwd,
        packagePath: extension,
        dependencies: false,
        ...(index > 0
          ? { allowMissingRepository: true, skipLicense: true }
          : {}),
      });
      execFileSync(
        cli,
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
    executable,
    [
      "--new-window",
      // Opt-in only for credential-free, disposable macOS test profiles.
      ...(process.platform === "darwin" &&
      process.env.VSCODE_TEST_MOCK_KEYCHAIN === "1"
        ? ["--use-mock-keychain"]
        : []),
      "--skip-welcome",
      "--skip-release-notes",
      ...(restrictedMode ? [] : ["--disable-workspace-trust"]),
      "--disable-telemetry",
      ...host.options,
      `--user-data-dir=${paths.userData}`,
      `--extensions-dir=${paths.extensions}`,
      ...(useSource
        ? developmentPaths.map(
            (directory) => `--extensionDevelopmentPath=${directory}`,
          )
        : []),
      `--remote-debugging-port=${port}`,
      paths.workspace,
    ],
    { detached: true, stdio: "ignore", env: cleanEnvironment() },
  );
  vscode.unref();

  writeState({ pid: vscode.pid!, webSocket: await devToolsWebSocket(port) });
}

/**
 * The environment for the test VS Code: its own home folder, because VS Code
 * reads and rewrites `~/.vscode/argv.json` whatever profile it is given, and
 * no variable that would make Electron act as Node.
 *
 * On Linux, X11 finds its authorization cookie in `~/.Xauthority` unless
 * XAUTHORITY says otherwise; point it at the real home's cookie, or the
 * window cannot open once HOME has moved.
 */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: paths.home };
  delete environment.ELECTRON_RUN_AS_NODE;
  const cookie = path.join(homedir(), ".Xauthority");
  if (
    process.platform === "linux" &&
    !environment.XAUTHORITY &&
    existsSync(cookie)
  ) {
    environment.XAUTHORITY = cookie;
  }
  return environment;
}
