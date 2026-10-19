import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** This package, which holds the PDF fixtures. */
const repository = path.resolve(__dirname, "..", "..");
/** The repository root: the extension under test (Markdown and Lumière PDF). */
const extension = path.resolve(repository, "..", "..");
// Keep the profile path short: VS Code puts sockets in it, and macOS limits
// socket paths to about 100 characters.
const root = path.join(
  "/tmp",
  `vscode-pdf-workshop-e2e-${createHash("sha256").update(repository).digest("hex").slice(0, 8)}`,
);

export const paths = {
  repository,
  extension,
  root,
  userData: path.join(root, "user-data"),
  extensions: path.join(root, "extensions"),
  workspace: path.join(root, "workspace"),
  /** HOME for the test VS Code, so it never touches the user's ~/.vscode. */
  home: path.join(root, "home"),
  download: path.join(extension, ".vscode-test"),
  fixtures: path.join(repository, "test", "fixtures", "generated"),
};

interface State {
  /** VS Code's main process; it leads its own process group. */
  pid: number;
  webSocket: string;
}

const stateFile = path.join(root, "state.json");

export function writeState(state: State): void {
  writeFileSync(stateFile, JSON.stringify(state));
}

export function readState(): State {
  return JSON.parse(readFileSync(stateFile, "utf8")) as State;
}
