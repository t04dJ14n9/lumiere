// Shared helpers: start an isolated VS Code on a visible display and drive it over CDP.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
const require = createRequire("/workspace/repos/mdwb-vim/package.json");
export const { chromium } = require("@playwright/test");

export const DISPLAY = process.env.DISPLAY_FOR_CARET ?? ":7";

/** Starts `code` with its own profile and extensions folder; returns the page and a stop() that closes it. */
export async function launch({
  root,
  extensions,
  workspace,
  port = 9333,
  settings = {},
  file,
}) {
  rmSync(`${root}/ud`, { recursive: true, force: true });
  mkdirSync(`${root}/ud/User`, { recursive: true });
  writeFileSync(
    `${root}/ud/User/settings.json`,
    JSON.stringify(
      {
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "security.workspace.trust.enabled": false,
        "extensions.autoUpdate": false,
        "extensions.autoCheckUpdates": false,
        "window.restoreWindows": "none",
        "workbench.tips.enabled": false,
        "workbench.secondarySideBar.defaultVisibility": "hidden",
        "chat.disableAIFeatures": true,
        "workbench.layoutControl.enabled": false,
        "window.dialogStyle": "custom",
        "editor.minimap.enabled": false,
        "editor.fontFamily": "DejaVu Sans Mono",
        "editor.fontSize": 16,
        "editor.lineHeight": 24,
        "workbench.colorTheme": "Default Dark Modern",
        ...settings,
      },
      null,
      2,
    ),
  );
  const child = spawn(
    "code",
    [
      "--new-window",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-workspace-trust",
      "--disable-telemetry",
      "--no-sandbox",
      `--user-data-dir=${root}/ud`,
      `--extensions-dir=${extensions}`,
      `--remote-debugging-port=${port}`,
      workspace,
      ...(file ? [file] : []),
    ],
    { detached: true, stdio: "ignore", env: { ...process.env, DISPLAY } },
  );
  child.unref();
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {}
  }
  if (!browser) throw new Error("VS Code did not start");
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find(
        (p) =>
          !p.url().startsWith("devtools:") && p.url().includes("workbench"),
      );
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  await page.locator(".monaco-workbench").waitFor();
  const stop = async () => {
    await Promise.race([
      browser.close(),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    // Only the window this script started: its own profile folder names it.
    spawn("pkill", ["-9", "-f", `user-data-dir=${root}/ud`]);
    await new Promise((r) => setTimeout(r, 1500));
  };
  return { page, browser, stop };
}
