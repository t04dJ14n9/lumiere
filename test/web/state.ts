import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = path.resolve(__dirname, "..", "..");

export const paths = {
  repository,
  /** This run's workspace and server state, outside the repository. */
  root: path.join(repository, "test-results", "web"),
  /** Where test-web keeps the VS Code for the Web builds it downloads. */
  downloads: path.join(repository, ".vscode-test-web"),
  fixtures: path.join(repository, "test", "web", "fixtures", "vault"),
  pdf: path.join(
    repository,
    "packages",
    "pdf",
    "test",
    "fixtures",
    "generated",
    "five.pdf",
  ),
};

interface State {
  /** The test-web server; it leads its own process group. */
  pid: number;
  url: string;
}

const stateFile = path.join(paths.root, "state.json");

export function writeState(state: State): void {
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));
}

export function readState(): State {
  return JSON.parse(readFileSync(stateFile, "utf8")) as State;
}
