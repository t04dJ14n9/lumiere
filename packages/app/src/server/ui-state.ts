/** The window's layout and theme (shared/ui-state.ts), kept in a JSON file. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  parseUiChange,
  readUiState,
  DEFAULT_UI_STATE,
  type UiState,
} from "../shared/ui-state";

export class UiStore {
  private state: UiState = { ...DEFAULT_UI_STATE };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.state = readUiState(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      this.state = { ...DEFAULT_UI_STATE };
    }
  }

  get(): UiState {
    return this.state;
  }

  /** Apply the valid part of a change and save it; the state after it. */
  async update(change: unknown): Promise<UiState> {
    this.state = { ...this.state, ...parseUiChange(change) };
    const text = JSON.stringify(this.state, null, 2) + "\n";
    // One write at a time, each of the latest state, so a slow write never lands last.
    this.writing = this.writing
      .then(() => save(this.file, text))
      .catch(() => {});
    await this.writing;
    return this.state;
  }
}

async function save(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}
