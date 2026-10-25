/** Small JSON files the server keeps in its data folder. */
import { mkdir, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";

/** Write through a temporary file, so a crash never leaves half a file. */
export async function saveFile(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}
