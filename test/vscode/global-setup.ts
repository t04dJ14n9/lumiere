/**
 * Starts a real VS Code for the tests: an isolated profile and extensions
 * folder under /tmp, this extension installed from a freshly packaged VSIX,
 * and a workspace holding the fixture PDFs. Playwright then connects to
 * VS Code's window over the Chrome DevTools Protocol.
 *
 * Set VSCODE_EXECUTABLE to test another build: an installed VS Code, or a
 * VS Code fork such as Cursor (its `cursor` executable; the CLI is then
 * `bin/cursor`).
 */
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { createVSIX } from '@vscode/vsce';
import { paths, writeState } from './state';

export default async function globalSetup(): Promise<void> {
  const { executable, cli } = await resolveVsCode();
  rmSync(paths.root, { recursive: true, force: true });
  mkdirSync(path.join(paths.userData, 'User'), { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.extensions, { recursive: true });
  writeFileSync(path.join(paths.userData, 'User', 'settings.json'), JSON.stringify({
    'window.newWindowDimensions': 'maximized',
    'workbench.startupEditor': 'none',
    'security.workspace.trust.enabled': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.autoUpdate': false,
  }, null, 2));

  mkdirSync(path.join(paths.workspace, 'docs'), { recursive: true });
  copyFileSync(path.join(paths.fixtures, 'outline.pdf'), path.join(paths.workspace, 'docs', 'outline.pdf'));
  writeFileSync(path.join(paths.workspace, 'notes.md'), '# Notes\n');

  const vsix = path.join(paths.root, 'extension.vsix');
  await createVSIX({ cwd: paths.repository, packagePath: vsix, dependencies: false });
  // A chat participant, as Copilot Chat declares, so VS Code's chat counts as
  // served and Copy Link for Agent opens it.
  const participant = path.join(paths.root, 'chat-participant.vsix');
  await createVSIX({
    cwd: path.join(paths.repository, 'test', 'fixtures', 'chat-participant'),
    packagePath: participant,
    dependencies: false,
    allowMissingRepository: true,
    skipLicense: true,
  });
  for (const extension of [vsix, participant]) {
    execFileSync(cli, ['--user-data-dir', paths.userData, '--extensions-dir', paths.extensions, '--install-extension', extension, '--force'], {
      stdio: 'ignore',
      env: cleanEnvironment(),
    });
  }

  const port = await freePort();
  const vscode = spawn(executable, [
    '--new-window',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-telemetry',
    // Cursor opens a sign-in screen over the window unless told not to.
    '--skip-onboarding',
    // No system keyring under test (xvfb, CI): keep secrets in a plain file.
    '--password-store=basic',
    `--user-data-dir=${paths.userData}`,
    `--extensions-dir=${paths.extensions}`,
    `--remote-debugging-port=${port}`,
    paths.workspace,
  ], { detached: true, stdio: 'ignore', env: cleanEnvironment() });
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
  const cookie = path.join(homedir(), '.Xauthority');
  if (process.platform === 'linux' && !environment.XAUTHORITY && existsSync(cookie)) environment.XAUTHORITY = cookie;
  return environment;
}

async function resolveVsCode(): Promise<{ executable: string; cli: string }> {
  let executable = process.env.VSCODE_EXECUTABLE ?? await downloadAndUnzipVSCode({ version: 'stable', cachePath: paths.download });
  // Newer macOS builds name the binary "Code"; the downloader still reports "Electron".
  if (!existsSync(executable)) executable = path.join(path.dirname(executable), 'Code');
  const app = process.platform === 'darwin' ? path.resolve(executable, '..', '..') : path.dirname(executable);
  const bin = process.platform === 'darwin' ? path.join(app, 'Resources', 'app', 'bin') : path.join(app, 'bin');
  // VS Code's CLI is bin/code; forks name it after themselves (Cursor: bin/cursor).
  const names = ['code', 'cursor'].map(name => (process.platform === 'win32' ? `${name}.cmd` : name));
  const cli = names.map(name => path.join(bin, name)).find(candidate => existsSync(candidate));
  if (!cli) throw new Error(`No editor CLI (${names.join(' or ')}) in ${bin}`);
  return { executable, cli };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port'))));
    });
  });
}

async function devToolsWebSocket(port: number): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return ((await response.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch {
      // VS Code is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('VS Code did not open its debugging port within 60 seconds');
}
