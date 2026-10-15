import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = path.resolve(__dirname, "..", "..");
/** The host under test: an installed VS Code or Cursor, or the downloaded VS Code. */
export const hostExecutable = process.env.VSCODE_EXECUTABLE;
// One profile per repository and host, so VS Code and Cursor runs never share
// state. Keep the path short: VS Code puts sockets in it, and macOS limits
// socket paths to about 100 characters.
const key = createHash("sha256")
  .update(`${repository}\n${hostExecutable ?? "downloaded"}`)
  .digest("hex")
  .slice(0, 8);
const root = path.join("/tmp", `markdown-workshop-e2e-${key}`);

export const paths = {
  repository,
  root,
  userData: path.join(root, "user-data"),
  extensions: path.join(root, "extensions"),
  workspace: path.join(root, "workspace"),
  /** HOME for the test VS Code, so it never touches the user's ~/.vscode. */
  home: path.join(root, "home"),
  /** Requests to the test probe extension and its answers (synthetic fixture output only). */
  probe: path.join(root, "probe"),
  download: path.join(repository, ".vscode-test"),
  fixtures: path.join(repository, "test", "fixtures", "generated"),
  probeExtension: path.join(repository, "test", "vscode", "probe-extension"),
};

interface State {
  /** VS Code's main process; it leads its own process group. */
  pid: number;
  webSocket: string;
  /** The host's product name and version, for the test report. */
  host: string;
}

const stateFile = path.join(root, "state.json");

export function writeState(state: State): void {
  writeFileSync(stateFile, JSON.stringify(state));
}

export function readState(): State {
  return JSON.parse(readFileSync(stateFile, "utf8")) as State;
}
