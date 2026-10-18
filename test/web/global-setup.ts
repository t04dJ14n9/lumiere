/**
 * Starts VS Code for the Web (@vscode/test-web, server only) with this
 * extension as a development extension and a copy of the fixture vault as
 * the workspace. The specs open it in Playwright's Chromium. test-web's
 * stable VS Code for the Web is a development tool here; the demo ships
 * Code-OSS.
 */
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { paths, writeState } from "./state";

export default async function globalSetup(): Promise<void> {
  const workspace = path.join(paths.root, "workspace");
  rmSync(paths.root, { recursive: true, force: true });
  cpSync(paths.fixtures, workspace, { recursive: true });
  if (!existsSync(paths.pdf)) {
    execFileSync("pnpm", ["--filter", "@workshop/pdf", "fixtures"], {
      stdio: "inherit",
    });
  }
  cpSync(paths.pdf, path.join(workspace, "papers", "five.pdf"));
  const port = await freePort();
  const server = spawn(
    path.join(paths.repository, "node_modules", ".bin", "vscode-test-web"),
    [
      "--browser=none",
      "--quality=stable",
      `--port=${port}`,
      `--testRunnerDataDir=${paths.downloads}`,
      `--extensionDevelopmentPath=${paths.repository}`,
      workspace,
    ],
    { detached: true, stdio: ["ignore", "pipe", "inherit"] },
  );
  const url = `http://localhost:${port}`;
  await listening(server, url);
  server.unref();
  writeState({ pid: server.pid!, url });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

/** Resolves once test-web says it listens (a first run downloads VS Code). */
function listening(
  server: ReturnType<typeof spawn>,
  url: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("test-web did not start within 5 minutes")),
      300_000,
    );
    server.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes(`Listening on ${url}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("exit", (code) =>
      reject(new Error(`test-web exited (${code}) before listening`)),
    );
  });
}
